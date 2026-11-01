import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.HOME = mkdtempSync(join(tmpdir(), "pi-hashline-lean2-test-"));

const jiti = createJiti(import.meta.url, { interopDefault: true });
const hashlineExtension = (await jiti.import("../index.ts")).default;
const upstreamExtension = (await jiti.import("pi-hashline-edit-pro")).default;
// Pristine upstream schemas, used to prove that stripping touches descriptions only.
const upstreamTools = new Map();
upstreamExtension({
  registerTool: (tool) => upstreamTools.set(tool.name, tool),
  registerCommand() {},
  on() {},
  getActiveTools: () => [],
  getAllTools: () => [],
  setActiveTools() {},
});
function stripDescriptions(value) {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (!value || typeof value !== "object") return value;
  const out = Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    if (key === "description") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) descriptor.value = stripDescriptions(descriptor.value);
    Object.defineProperty(out, key, descriptor);
  }
  return out;
}
const collapsedDisplayService = Symbol.for(
  "@local/pi-collapsed-tools.display-service.v1",
);
const expectedTools = [
  "read",
  "outline",
  "replace",
  "replace_match",
  "insert",
  "copy",
  "move",
  "grep",
  "undo_last_change",
];

function createPi(registered, commands) {
  return {
    registerTool(tool) {
      registered.push(tool);
    },
    registerCommand(name, cmd) {
      commands.push([name, cmd]);
    },
    on() {},
    getActiveTools() {
      return ["read", "bash", "write", "grep", ...expectedTools];
    },
    getAllTools() {
      return [];
    },
    setActiveTools() {},
  };
}

// Only the lean range/insert-edge/transfer field descriptions survive; everything else is stripped.
const KEPT_DESCRIPTIONS = {
  replace: ["properties.remove_from", "properties.remove_to", "properties.text"],
  replace_match: ["properties.replace_from", "properties.replace_to"],
  insert: ["properties.text"],
  copy: ["properties.source_from", "properties.source_to", "properties.anchor"],
  outline: ["properties.depth"],
};

function descriptionPaths(value, at = []) {
  if (!value || typeof value !== "object") return [];
  const own = "description" in value ? [at.join(".")] : [];
  return own.concat(
    Object.entries(value).flatMap(([key, child]) => descriptionPaths(child, [...at, key])),
  );
}

test("registers the upstream 7.1.1 tools with lean model-facing text", () => {
  const registered = [];
  const commands = [];
  const pi = createPi(registered, commands);
  const originalRegisterTool = pi.registerTool;

  hashlineExtension(pi);

  assert.equal(pi.registerTool, originalRegisterTool);
  assert.deepEqual(registered.map((tool) => tool.name), expectedTools);

  for (const tool of registered) {
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length < 100, `${tool.name} description is not lean`);
    // Pi lists a tool under "Available tools" only when it has a snippet.
    assert.equal(typeof tool.promptSnippet, "string");
    assert.ok(tool.promptSnippet.length < 50, `${tool.name} snippet is not lean`);
    assert.ok(tool.promptGuidelines === undefined || Array.isArray(tool.promptGuidelines));
    assert.deepEqual(descriptionPaths(tool.parameters), KEPT_DESCRIPTIONS[tool.name] ?? []);
    // The newline note is stated once in the shared edit rule, not per field.
    assert.ok(!JSON.stringify(tool.parameters).includes("A trailing line break"));
    // Stripping drops `description` keys and nothing else: once both sides lose their
    // descriptions the schema must match upstream's exactly, so markers such as
    // `~kind` (and 7.x's raw `~unsafe` enum on `direction`) survive untouched.
    assert.deepEqual(
      stripDescriptions(tool.parameters),
      stripDescriptions(upstreamTools.get(tool.name).parameters),
      `${tool.name} schema drifted from upstream`,
    );
  }

  // 6.x contract: anchor-only edits (no path) take one exact `text` string.
  const replace = registered.find((tool) => tool.name === "replace");
  assert.deepEqual(Object.keys(replace.parameters.properties), [
    "remove_from",
    "remove_to",
    "text",
  ]);
  const insert = registered.find((tool) => tool.name === "insert");
  assert.deepEqual(Object.keys(insert.parameters.properties), [
    "anchor",
    "direction",
    "text",
  ]);
  const undo = registered.find((tool) => tool.name === "undo_last_change");
  assert.deepEqual(Object.keys(undo.parameters.properties), ["path"]);

  // Lean text must not teach retired 4.x names or fields.
  const visible = JSON.stringify([
    ...registered.map((tool) => [tool.description, tool.promptGuidelines, tool.parameters]),
    ...commands.map(([, cmd]) => cmd.description),
  ]);
  for (const stale of ["replacement_lines", "anchor_grep", "E_AUTO_READ_ALL", "one string per item"]) {
    assert.equal(visible.includes(stale), false, `model-visible text mentions ${stale}`);
  }
  // Lean text only condenses upstream: no routing to bash or scripts of its own.
  for (const own of [/\bbash\b/i, /\bscripts?\b/i]) {
    assert.equal(own.test(visible), false, `model-visible text adds ${own}`);
  }
  // Upstream's partial-line route on replace and its cross-file move undo rule follow the toggles.
  assert.ok(replace.description.includes("replace_match"));
  assert.ok(undo.promptGuidelines.some((line) => line.includes("cross-file move")));
  // Upstream repeats its tool-preference line on every tool; lean keeps it once, on read.
  assert.deepEqual(
    registered
      .filter((tool) => (tool.promptGuidelines ?? []).some((line) => line.startsWith("Remember to use the hashline tools")))
      .map((tool) => tool.name),
    ["read"],
  );
});

test("trims upstream command descriptions without dropping commands", () => {
  const registered = [];
  const commands = [];
  hashlineExtension(createPi(registered, commands));

  const byName = Object.fromEntries(commands);
  assert.ok("hashline-config" in byName);
  assert.ok("clear-anchors" in byName);
  for (const [, cmd] of commands) {
    assert.equal(typeof cmd.description, "string");
    assert.ok(cmd.description.length < 80);
    assert.equal(typeof cmd.handler, "function");
  }
});

test("uses the optional local collapsed-display service without installing one", () => {
  const registered = [];
  const commands = [];
  const decorated = [];
  globalThis[collapsedDisplayService] = {
    version: 1,
    decorate(tool) {
      decorated.push(tool.name);
      return { ...tool, collapsedDisplayDecorated: true };
    },
  };

  try {
    hashlineExtension(createPi(registered, commands));
  } finally {
    delete globalThis[collapsedDisplayService];
  }

  assert.deepEqual(decorated, expectedTools);
  assert.ok(registered.every((tool) => tool.collapsedDisplayDecorated === true));
  assert.equal(globalThis[collapsedDisplayService], undefined);
});

// Models still send retired field names or stray fields; prepareArguments repairs only
// unambiguous slips before validation and leaves the rest for upstream to reject.
test("prepareArguments repairs retired edit field names and a redundant ref, chained after upstream's", async () => {
  const { Value } = await jiti.import("typebox/value");
  const { assertReq, assertInsertReq } = await jiti.import("pi-hashline-edit-pro/src/payload-contract");
  const registered = [];
  hashlineExtension(createPi(registered, []));
  const replace = registered.find((tool) => tool.name === "replace");
  const insert = registered.find((tool) => tool.name === "insert");
  const range = { remove_from: "amrac", remove_to: "amrac" };
  // Passes both the schema and upstream's runtime shape check.
  const valid = (tool, assertShape, args) => {
    const prepared = tool.prepareArguments(args);
    assert.equal(Value.Check(tool.parameters, prepared), true);
    assertShape(prepared);
    return prepared;
  };

  // replacement_text / replacement_lines -> text (lines joined by upstream's own prepare).
  assert.equal(valid(replace, assertReq, { ...range, replacement_text: "x\ny" }).text, "x\ny");
  const lines = valid(replace, assertReq, { ...range, replacement_lines: ["x", "y"] });
  assert.equal(lines.text, "x\ny");
  assert.equal("replacement_lines" in lines, false);
  // insert `lines` -> text.
  assert.equal(valid(insert, assertInsertReq, { anchor: "amrac", direction: "after", lines: ["a", "b"] }).text, "a\nb");
  // Upstream's own aliases still work, together with ours.
  const both = valid(replace, assertReq, { replace_from: "amrac", replace_to: "amrac", replacement_text: "z" });
  assert.deepEqual([both.remove_from, both.remove_to, both.text], ["amrac", "amrac", "z"]);

  // ref is dropped only when it spells the same path (separators and a leading ./ aside).
  for (const [path, ref] of [["src/a.ts", "./src/a.ts"], ["C:/proj\\package.json", "C:/proj/package.json"]]) {
    const dropped = valid(replace, assertReq, { ...range, text: "x", path, ref });
    assert.equal("ref" in dropped, false);
  }
  // A mere suffix may be a different file (src/a.ts vs ./a.ts), so it is kept and rejected.
  for (const [path, ref] of [["src/a.ts", "package.json"], ["src/a.ts", "a.ts"]]) {
    const kept = replace.prepareArguments({ ...range, text: "x", path, ref });
    assert.equal(kept.ref, ref);
    assert.throws(() => assertReq(kept), /unknown or unsupported fields: ref/);
  }
  assert.equal("ref" in replace.prepareArguments({ ...range, text: "x", ref: "package.json" }), true);

  // Explicit text is never overwritten; the conflicting alias stays and is rejected.
  const conflict = replace.prepareArguments({ ...range, text: "keep", replacement_text: "other" });
  assert.deepEqual([conflict.text, conflict.replacement_text], ["keep", "other"]);
  assert.throws(() => assertReq(conflict), /replacement_text/);

  // Ambiguous or uninferable shapes come back untouched and still fail validation.
  const insertStyle = { anchor: "XdMQ", remove_from: "XdMQ", direction: "after", lines: ["a"] };
  assert.deepEqual(replace.prepareArguments(insertStyle), insertStyle);
  assert.equal(Value.Check(replace.parameters, replace.prepareArguments(insertStyle)), false);
  for (const args of [
    { path: "a.ts", replacement_text: "x" },
    { anchor: "ccJE", replacement_lines: ["x"] },
  ]) {
    const prepared = replace.prepareArguments(args);
    assert.equal(Value.Check(replace.parameters, prepared), false);
    assert.equal("remove_from" in prepared, false);
  }
  // remove_to is not defaulted to remove_from.
  const noTo = replace.prepareArguments({ remove_from: "amrac", text: "x" });
  assert.equal("remove_to" in noTo, false);
  assert.equal(Value.Check(replace.parameters, noTo), false);
  // insert without anchor stays invalid.
  assert.equal(Value.Check(insert.parameters, insert.prepareArguments({ direction: "after", lines: ["a"] })), false);

  // Pure, idempotent, non-throwing; non-object input passes through.
  const input = Object.freeze({ ...range, replacement_lines: ["x"], ref: "a" });
  const once = replace.prepareArguments(input);
  assert.deepEqual(replace.prepareArguments(once), once);
  assert.equal("replacement_lines" in input, true);
  for (const odd of [undefined, null, "x", 3, ["x"]]) assert.deepEqual(replace.prepareArguments(odd), odd);

  // Other tools keep upstream's prepare untouched by this layer.
  const match = registered.find((tool) => tool.name === "replace_match");
  assert.equal(match.prepareArguments({ remove_from: "a", remove_to: "b" }).replace_from, "a");
});
