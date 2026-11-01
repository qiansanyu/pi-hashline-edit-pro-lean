// Reproductions for the three upstream defects found while auditing 6.4.6 against
// 7.1.1. The same script runs before and after a version bump; each case prints a
// RESULT line with the observed values, so the two runs can be diffed directly.
//
//   node bench/repro.mjs [--upstream]
//
// Case 1 (crlf-dollar): ripgrep gets no --crlf in 6.4.6, so `$` never matches in a
//   CRLF file. 7.1.1 passes --crlf (upstream src/grep.ts:320).
// Case 2 (clipped-line): edit a 3-line range whose interior line changed on disk,
//   so the range check — not anchor resolution — reports the mismatch. The 300
//   character boundary line is printed clipped (203 characters) either way:
//   - 6.4.6 marks that row served and says "Retry with the fresh anchors above
//     without a read"            -> saysRetryWithoutRead=true,  saysCallRead=false
//   - 7.1.1 says "clipped above and not editable from here; call read()"
//                               -> saysRetryWithoutRead=false, saysCallRead=true
//   retryWithShownText stays "accepted" in both: the line was already served in
//   full by the earlier read, and a re-text is indistinguishable from an intentional
//   edit, so 7.1.1's guard is the feedback contract, not a hard rejection. The
//   regression to watch is the feedback keys, not the retry.
//   (upstream src/hashline/resolve.ts:447-470, 8d01ce2)
// Case 3 (huge-span): not reachable from the tool surface — it needs a span of
//   >125k array elements, and the 50KB/2000-line serve cap prevents serving such a
//   range, so the edit is refused earlier. Fixed structurally upstream in 9353b11.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const target = process.argv.includes("--upstream") ? "upstream" : "lean";
const jiti = createJiti(import.meta.url, { interopDefault: true });
const extension = target === "upstream"
  ? (await jiti.import("pi-hashline-edit-pro")).default
  : (await jiti.import("../index.ts")).default;

const cwd = mkdtempSync(join(tmpdir(), "hashline-repro-"));
writeFileSync(join(cwd, "config.json"), "{}");
process.env.PI_HASHLINE_DIR = cwd;

const tools = new Map();
const handlers = {};
let active = ["read", "bash", "write", "grep"];
extension({
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
for (const handler of handlers.session_start ?? []) await handler({}, ctx);
await new Promise((resolve) => setTimeout(resolve, 250));

const signal = ctx.signal;
const noop = () => {};
const textOf = (result) => (result?.content ?? []).map((entry) => entry.text ?? "").join("\n");
// read rows are `anchor│content`; grep rows carry a `N:│ ` prefix.
const ROW = /^(?:\d+[:|-]│\s*)?([A-Za-z]{4,5})│(.*)$/;
const rowsOf = (text) =>
  text
    .split("\n")
    .map((line) => ROW.exec(line.trim()))
    .filter(Boolean)
    .map((match) => ({ anchor: match[1], content: match[2] }));

const results = [];
function report(name, values) {
  results.push({ name, ...values });
  console.log(`RESULT ${name} ${Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")}`);
}

async function call(tool, id, args) {
  try {
    return { ok: true, result: await tools.get(tool).execute(id, args, signal, noop, ctx) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Case 1 — `$` in a CRLF file.
{
  writeFileSync(join(cwd, "crlf.txt"), "alpha\r\nbeta\r\n");
  const called = await call("grep", "grep-crlf", { pattern: "alpha$", path: "crlf.txt" });
  const text = called.ok ? textOf(called.result) : called.error;
  if (process.env.REPRO_DEBUG) console.log(`--- crlf-dollar output ---\n${text.slice(0, 600)}`);
  report("crlf-dollar", { ok: called.ok, matchedRows: rowsOf(text).length });
}

// Case 2 — a stale anchor on a 300-character line.
{
  const file = join(cwd, "long.txt");
  const long = "y".repeat(300);
  writeFileSync(file, [long, "m", "e"].join("\n") + "\n");
  const first = await call("read", "read-long", { path: "long.txt" });
  const firstRows = first.ok ? rowsOf(textOf(first.result)) : [];
  const [startAnchor, , endAnchor] = firstRows.map((row) => row.anchor);
  const servedLength = firstRows[0]?.content.length ?? 0;

  // Change an interior line on disk. The boundary anchors still resolve, so the
  // range check reports the mismatch — and its feedback is where a long line is
  // printed clipped.
  writeFileSync(file, [long, "n", "e"].join("\n") + "\n");
  const refused = await call("replace", "replace-stale", {
    remove_from: startAnchor,
    remove_to: endAnchor,
    text: "X",
  });
  const feedback = refused.ok ? textOf(refused.result) : refused.error ?? "";
  const fresh = rowsOf(feedback)[0];
  const saysRetryWithoutRead = /Retry with the fresh anchors above without a read/.test(feedback);
  const saysCallRead = /clipped above and not editable/.test(feedback);

  let retryWithShownText = "no-fresh-anchor";
  if (process.env.REPRO_DEBUG) console.log(`--- clipped-line feedback ---\n${feedback.slice(0, 800)}`);
  let lineLengthAfterRetry = -1;
  if (fresh) {
    const applied = await call("replace", "replace-clipped", {
      remove_from: fresh.anchor,
      remove_to: fresh.anchor,
      text: fresh.content,
    });
    retryWithShownText = applied.ok ? "accepted" : "rejected";
    const line = readFileSync(file, "utf8").split("\n")[0] ?? "";
    lineLengthAfterRetry = line.length;
  }

  report("clipped-line", {
    servedLength,
    shownLength: fresh?.content.length ?? 0,
    retryWithShownText,
    lineLengthAfterRetry,
    saysRetryWithoutRead,
    saysCallRead,
  });
}

// Case 3 — recorded as not reachable, not run.
report("huge-span", { status: "not-reachable-from-tool-surface" });

// Windows keeps the sqlite WAL open until the store shuts down; close it before
// removing the scratch directory, and never let cleanup mask a case result.
try {
  const { shutdownHashStore } = await jiti.import("pi-hashline-edit-pro/src/hash-store");
  await shutdownHashStore();
} catch {
  // Older releases may not export it; the temp directory is disposable anyway.
}
try {
  rmSync(cwd, { recursive: true, force: true });
} catch {
  console.log(`(left ${cwd} behind: locked)`);
}
console.log(`\n${results.length} cases (${target})`);
