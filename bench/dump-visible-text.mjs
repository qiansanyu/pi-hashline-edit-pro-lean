// Dumps every model-facing string the extension registers, so a version bump can
// be diffed and counted instead of eyeballed.
//   node bench/dump-visible-text.mjs <label> [--upstream]
//
// --upstream dumps the bare upstream extension instead of this wrapper, so both
// can be measured in the same harness.
// Writes bench/snapshots/<label>.json (full detail) and <label>.txt (diffable).
// Bytes cover only what reaches the model: tool description, prompt snippet,
// every prompt guideline, and every JSON-Schema `description` (recursively).
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const target = process.argv.includes("--upstream") ? "upstream" : "lean";
// Only a bare word is a label; `npm run bench:upstream` appends `--upstream`.
const requestedLabel = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

// fileURLToPath, not URL.pathname: the installed clone lives under a non-ASCII home
// directory, and `.pathname` percent-encodes it into an unopenable path.
const root = fileURLToPath(new URL("..", import.meta.url));
const combos = [
  { id: "default", config: {}, codemode: false },
  { id: "no-replace-match-no-copy-move", config: { replaceMatchEnabled: false, copyMoveEnabled: false }, codemode: false },
  { id: "auto-read-off", config: { autoRead: false }, codemode: false },
  { id: "codemode", config: {}, codemode: true },
];

const jiti = createJiti(import.meta.url, { interopDefault: true });
const extension = target === "upstream"
  ? (await jiti.import("pi-hashline-edit-pro")).default
  : (await jiti.import("../index.ts")).default;

function paramDescriptions(value, out = []) {
  if (Array.isArray(value)) {
    for (const entry of value) paramDescriptions(entry, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "description" && typeof entry === "string") out.push(entry);
    else paramDescriptions(entry, out);
  }
  return out;
}

const bytes = (text) => Buffer.byteLength(text ?? "", "utf8");

async function renderCombo({ config, codemode }) {
  const dir = mkdtempSync(join(tmpdir(), "hashline-lean-dump-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  process.env.PI_HASHLINE_DIR = dir;

  const tools = new Map();
  const handlers = {};
  let active = ["read", "bash", "write", "grep", ...(codemode ? ["codemode"] : [])];
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
  const ctx = { cwd: dir, signal: new AbortController().signal, ui: { notify() {} } };
  for (const handler of handlers.session_start ?? []) await handler({}, ctx);
  // Upstream re-registers the edit tools after it reads the config.
  await new Promise((resolve) => setTimeout(resolve, 250));

  const entries = [];
  for (const name of [...tools.keys()].sort()) {
    const tool = tools.get(name);
    const description = typeof tool.description === "string" ? tool.description : "";
    const snippet = typeof tool.promptSnippet === "string" ? tool.promptSnippet : "";
    const rawGuidelines = tool.promptGuidelines ?? [];
    const guidelines = (Array.isArray(rawGuidelines) ? rawGuidelines : [rawGuidelines]).filter(
      (line) => typeof line === "string",
    );
    const params = paramDescriptions(tool.parameters);
    entries.push({
      name,
      description,
      snippet,
      guidelines,
      paramDescriptions: params,
      bytes: {
        description: bytes(description),
        snippet: bytes(snippet),
        guidelines: guidelines.reduce((sum, line) => sum + bytes(line), 0),
        paramDescriptions: params.reduce((sum, line) => sum + bytes(line), 0),
      },
    });
  }

  const total = entries.reduce(
    (sum, entry) => ({
      description: sum.description + entry.bytes.description,
      snippet: sum.snippet + entry.bytes.snippet,
      guidelines: sum.guidelines + entry.bytes.guidelines,
      paramDescriptions: sum.paramDescriptions + entry.bytes.paramDescriptions,
    }),
    { description: 0, snippet: 0, guidelines: 0, paramDescriptions: 0 },
  );
  return { tools: entries, total: { ...total, all: total.description + total.snippet + total.guidelines + total.paramDescriptions } };
}

const upstreamPkg = JSON.parse(readFileSync(join(root, "node_modules/pi-hashline-edit-pro/package.json"), "utf8"));
const leanVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
// Default label is the version, so `npm run bench` needs no argument.
const label = requestedLabel ?? `${target === "upstream" ? upstreamPkg.version : leanVersion}${target === "upstream" ? "-upstream" : ""}`;
const snapshot = {
  label,
  target,
  // No timestamp: the snapshots are committed, and a run clock would make every
  // regeneration show up as a diff.
  environment: {
    node: process.version,
    platform: process.platform,
    upstreamVersion: upstreamPkg.version,
    leanVersion: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  },
  combos: [],
};

for (const combo of combos) {
  snapshot.combos.push({ id: combo.id, ...(await renderCombo(combo)) });
}

mkdirSync(join(root, "bench/snapshots"), { recursive: true });
writeFileSync(join(root, `bench/snapshots/${label}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);

const lines = [];
lines.push(`# model-facing text · ${label} · ${target}`);
lines.push(`# upstream ${snapshot.environment.upstreamVersion} · lean ${snapshot.environment.leanVersion} · node ${snapshot.environment.node} · ${snapshot.environment.platform}`);
for (const combo of snapshot.combos) {
  lines.push("");
  lines.push(`## ${combo.id}  (${combo.tools.length} tools, ${combo.total.all} B)`);
  lines.push(
    `# total: desc ${combo.total.description} B · snippet ${combo.total.snippet} B · guidelines ${combo.total.guidelines} B · param-desc ${combo.total.paramDescriptions} B`,
  );
  for (const tool of combo.tools) {
    lines.push("");
    lines.push(`### ${tool.name}  (${tool.bytes.description + tool.bytes.snippet + tool.bytes.guidelines + tool.bytes.paramDescriptions} B)`);
    lines.push(`D  ${tool.description}`);
    if (tool.snippet) lines.push(`S  ${tool.snippet}`);
    for (const line of tool.guidelines) lines.push(`G  ${line}`);
    for (const line of tool.paramDescriptions) lines.push(`P  ${line}`);
  }
}
writeFileSync(join(root, `bench/snapshots/${label}.txt`), `${lines.join("\n")}\n`);

console.log(`wrote bench/snapshots/${label}.json and .txt`);
for (const combo of snapshot.combos) {
  console.log(`  ${combo.id.padEnd(34)} tools=${combo.tools.length} bytes=${combo.total.all}`);
}
