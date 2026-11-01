// End-to-end smoke over the tool surface on real files: the paths unit tests do not
// reach, in the shapes 7.1.1 changed. Kept separate from runtime.test.mjs so a failure
// names which surface broke.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const home = await mkdtemp(join(tmpdir(), "pi-hashline-lean-smoke-home-"));
const cwd = await mkdtemp(join(tmpdir(), "pi-hashline-lean-smoke-cwd-"));
process.env.HOME = home;
process.env.PI_HASHLINE_DIR = home;

const jiti = createJiti(import.meta.url, { interopDefault: true });
const hashlineExtension = (await jiti.import("../index.ts")).default;

const tools = new Map();
const handlers = {};
let active = ["read", "write", "grep", "edit", "bash"];
hashlineExtension({
  registerTool: (tool) => tools.set(tool.name, tool),
  registerCommand() {},
  on: (event, handler) => (handlers[event] ??= []).push(handler),
  getActiveTools: () => active,
  getAllTools: () => [],
  setActiveTools: (next) => {
    active = next;
  },
});

const ctx = { cwd, signal: new AbortController().signal, ui: { notify() {} } };
await writeFile(join(cwd, "config.json"), JSON.stringify({ outlineEnabled: true }));
for (const handler of handlers.session_start ?? []) await handler({}, ctx);
await new Promise((resolve) => setTimeout(resolve, 250));

const noop = () => {};
const text = (result) => (result?.content ?? []).map((entry) => entry.text ?? "").join("\n");
const rows = (out) =>
  out
    .split("\n")
    .map((line) => /^(?:\d+[:|-]│\s*)?([a-z]{5})│(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => ({ anchor: match[1], content: match[2] }));
const run = (name, args) => tools.get(name).execute(`${name}-call`, args, ctx.signal, noop, ctx);

test("outline rows are live anchors for the file they map", async () => {
  const file = join(cwd, "shapes.ts");
  await writeFile(
    file,
    [
      "export function alpha(value: number): number {",
      "  return value + 1;",
      "}",
      "",
      "export function beta(value: number): string {",
      "  return String(value);",
      "}",
      "",
    ].join("\n"),
  );
  const outlined = await run("outline", { path: "shapes.ts" });
  const mapped = rows(text(outlined));
  assert.equal(mapped.length, 2, "one row per top-level declaration");
  assert.deepEqual(mapped.map((row) => row.content), [
    "export function alpha(value: number): number {",
    "export function beta(value: number): string {",
  ]);

  // The row anchor edits the file without a read, which is the whole point of the tool.
  await run("replace", { remove_from: mapped[1].anchor, remove_to: mapped[1].anchor, text: "export function gamma(value: number): string {" });
  assert.match(await readFile(file, "utf8"), /export function gamma\(value: number\): string \{/);
});

test("a grep row from a CRLF file is editable without a read", async () => {
  const file = join(cwd, "crlf.txt");
  await writeFile(file, "alpha\r\nbeta\r\ngamma\r\n");
  const hits = await run("grep", { pattern: "beta$", path: "crlf.txt" });
  const [hit] = rows(text(hits));
  assert.ok(hit, "a dollar-anchored pattern matches a CRLF line");
  assert.equal(hit.content, "beta");
  await run("replace", { remove_from: hit.anchor, remove_to: hit.anchor, text: "BETA" });
  assert.match(await readFile(file, "utf8"), /BETA/);
});

test("copy and move carry five-character anchors across files", async () => {
  const source = join(cwd, "source.txt");
  const target = join(cwd, "target.txt");
  await writeFile(source, "one\ntwo\nthree\n");
  await writeFile(target, "head\ntail\n");

  const from = rows(text(await run("read", { path: "source.txt" })));
  const to = rows(text(await run("read", { path: "target.txt" })));
  const two = from.find((row) => row.content === "two");
  const head = to.find((row) => row.content === "head");

  await run("copy", { source_from: two.anchor, source_to: two.anchor, anchor: head.anchor, direction: "after" });
  assert.equal(await readFile(target, "utf8"), "head\ntwo\ntail\n");

  const afterCopy = rows(text(await run("read", { path: "source.txt" })));
  const three = afterCopy.find((row) => row.content === "three");
  await run("move", { source_from: three.anchor, source_to: three.anchor, anchor: head.anchor, direction: "before" });
  assert.equal(await readFile(target, "utf8"), "three\nhead\ntwo\ntail\n");
  assert.equal(await readFile(source, "utf8"), "one\ntwo\n");
});

test("write echoes the file back with anchors that a follow-up replace can use", async () => {
  const file = join(cwd, "written.txt");
  // `write` is Pi's own tool; the extension appends the auto-read block from its
  // tool_result hook, so drive that hook the way a finished `write` does.
  await writeFile(file, "first\nsecond\n");
  const echoedResult = await handlers.tool_result[0](
    {
      toolName: "write",
      isError: false,
      input: { path: "written.txt", content: "first\nsecond\n" },
      content: [{ type: "text", text: "Successfully wrote to written.txt" }],
    },
    ctx,
  );
  const echoed = rows(text(echoedResult));
  assert.deepEqual(echoed.map((row) => row.content), ["first", "second"]);
  await run("replace", { remove_from: echoed[1].anchor, remove_to: echoed[1].anchor, text: "SECOND" });
  assert.equal(await readFile(file, "utf8"), "first\nSECOND\n");
});

test.after(async () => {
  try {
    const { shutdownHashStore } = await jiti.import("pi-hashline-edit-pro/src/hash-store");
    await shutdownHashStore();
  } catch {
    // Older releases may not export it.
  }
  await rm(home, { recursive: true, force: true }).catch(() => {});
  await rm(cwd, { recursive: true, force: true }).catch(() => {});
});
