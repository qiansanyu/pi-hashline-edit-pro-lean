import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const home = await mkdtemp(join(tmpdir(), "pi-hashline-lean2-home-"));
const cwd = await mkdtemp(join(tmpdir(), "pi-hashline-lean2-cwd-"));
process.env.HOME = home;

const jiti = createJiti(import.meta.url, { interopDefault: true });
const hashlineExtension = (await jiti.import("../index.ts")).default;
const { shutdownHashStore } = await jiti.import(
  "pi-hashline-edit-pro/src/hash-store",
);

function anchorsFrom(result) {
  const text = result.content.find((entry) => entry.type === "text")?.text ?? "";
  return new Map(
    text
      .split("\n")
      .map((line) => /^([a-z]{5})│(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[2], match[1]]),
  );
}

test("preserves upstream 7.1.1 read, replace, insert, undo, and write-hook behavior", async () => {
  const file = join(cwd, "sample.txt");
  await writeFile(file, "alpha\nbeta\n");

  const tools = [];
  const handlers = {};
  // Mirror a real session: Pi activates every registered tool by default.
  let activeTools = ["read", "write", "grep", "edit", "bash", "replace", "replace_match", "insert", "copy", "move", "undo_last_change"];
  const pi = {
    registerTool(tool) {
      const index = tools.findIndex((entry) => entry.name === tool.name);
      if (index >= 0) tools[index] = tool;
      else tools.push(tool);
    },
    registerCommand() {},
    on(name, handler) {
      (handlers[name] ??= []).push(handler);
    },
    getActiveTools() {
      return activeTools;
    },
    getAllTools() {
      return [];
    },
    setActiveTools(next) {
      activeTools = next;
    },
  };
  hashlineExtension(pi);

  const signal = new AbortController().signal;
  const ctx = { cwd, signal, ui: { notify() {} } };
  await handlers.session_start[0]({}, ctx);
  assert.equal(activeTools.includes("edit"), false);
  // Anchored grep owns the `grep` name; all eight tools keep upstream's default (on).
  for (const name of ["grep", "replace", "replace_match", "insert", "copy", "move", "undo_last_change", "bash"]) {
    assert.equal(activeTools.includes(name), true, `${name} should be active`);
  }

  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const firstRead = await byName.read.execute(
    "read-1",
    { path: "sample.txt" },
    signal,
    () => {},
    ctx,
  );
  const firstAnchors = anchorsFrom(firstRead);
  assert.equal(firstAnchors.get("alpha")?.length, 5);
  assert.equal(firstAnchors.get("beta")?.length, 5);

  // 6.x is anchor-only with one exact `text` string.
  await byName.replace.execute(
    "replace-1",
    {
      remove_from: firstAnchors.get("beta"),
      remove_to: firstAnchors.get("beta"),
      text: "BETA",
    },
    signal,
    () => {},
    ctx,
  );
  assert.equal(await readFile(file, "utf8"), "alpha\nBETA\n");

  const secondRead = await byName.read.execute(
    "read-2",
    { path: "sample.txt" },
    signal,
    () => {},
    ctx,
  );
  const secondAnchors = anchorsFrom(secondRead);
  await byName.insert.execute(
    "insert-1",
    {
      anchor: secondAnchors.get("alpha"),
      direction: "after",
      text: "between",
    },
    signal,
    () => {},
    ctx,
  );
  assert.equal(await readFile(file, "utf8"), "alpha\nbetween\nBETA\n");

  await byName.undo_last_change.execute(
    "undo-1",
    { path: "sample.txt" },
    signal,
    () => {},
    ctx,
  );
  assert.equal(await readFile(file, "utf8"), "alpha\nBETA\n");

  const finalRead = await byName.read.execute(
    "read-3",
    { path: "sample.txt" },
    signal,
    () => {},
    ctx,
  );
  const echoed = finalRead.content.find((entry) => entry.type === "text")?.text;
  const denial = await handlers.tool_call[0](
    { toolName: "write", input: { path: "sample.txt", content: echoed } },
    ctx,
  );
  assert.equal(denial.block, true);
  assert.match(denial.reason, /\[E_WRITE_HASH_ECHO\]/);
});

test.after(async () => {
  shutdownHashStore();
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(cwd, { recursive: true, force: true }),
  ]);
});
