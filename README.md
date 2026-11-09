# pi-hashline-edit-pro-lean

<!-- token-benchmark:summary:start -->
> **Tool text: Lean 854 tokens, upstream `pi-hashline-edit-pro@7.2.0` 3,666 — 76.7% fewer.**
<!-- token-benchmark:summary:end -->
> [Pi setup reference from the upstream author](https://github.com/kunkun9527/my-lean-pi-setup)

[简体中文](README_zh-CN.md)

A token-lean Pi wrapper around [`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro). It pins the complete upstream `7.2.0` runtime while shortening persistent provider-facing tool text.

## This fork

A fork of [`kunkun9527/pi-hashline-edit-pro-lean`](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) taken at `6.4.6-lean.3`, ported to upstream `pi-hashline-edit-pro@7.2.0`. Maintained for personal use and installed from git, so it is not published to npm; `kunkun9527`'s package remains the original 6.4.6 release.

Against the wrapper it forked from: `outline` is ported, anchors are the five-character lowercase form 7.x serves, the runtime is pinned to the runtime fork's `mine` branch (which carries one behavioural change, `autoReadWrite`), and the context measurement is now a harness the repository reproduces. What changed, why, and how to sync with upstream: [`FORK.md`](FORK.md).

## Context footprint

<!-- token-benchmark:benchmark:start -->
854 tokens against upstream's 3,666 at the same settings — **76.7% fewer**. Everything this extension adds to the model's context is tool text, and all of it is measured by `bench/dump-visible-text.mjs`; the four-settings table, the snapshots, and the reproduction scripts live in [`bench/`](bench/README.md).
<!-- token-benchmark:benchmark:end -->

## What it keeps

- Five-character lowercase Hashline anchors and served-anchor validation.
- Safe anchor-only `replace`, `replace_match`, `insert`, `copy`, and `move` operations (no `path` by default), plus per-file undo.
- Anchored ripgrep results under the `grep` name, enabled by default.
- Hash store, automatic reads, file checks, write-echo protection, and upstream session hooks.
- The upstream runtime, schemas, and tool availability settings rather than a reduced reimplementation.
- Optional compatibility with the local `@local/pi-collapsed-tools.display-service.v1` decorator.

## Why it is lean

Only model-facing prose is trimmed, and every line is upstream's own wording condensed: concise descriptions, one-line tool-list snippets, and short versions of upstream's usage rules; each rule is said once, so parameter descriptions are removed except upstream's text for range bounds, copy's source and destination (move takes the same fields), `text` (its newline note moves to the shared edit rule), and `outline`'s `depth`; no prompt resources and no rules of our own are added. Rules that upstream already enforces with an error naming the fix (unread range lines, overlapping batch ranges, stale anchors, path ownership) are left to that error instead of the prompt. The prompt keeps upstream's rules whose violation would silently produce a wrong edit or lose something an error cannot give back: the `anchor│content` row format, escape decoding, batch and single-slot undo, append and deletion semantics. Lines upstream shows only under some settings (replace_match or copy/move off, autoRead off, codemode on) follow those settings; upstream's tool-preference line, which it repeats on every tool, is kept once on `read`, and codemode-only guidelines pass through unchanged. Runtime behavior, defaults, validation, error contracts, and tool schemas are the pinned upstream runtime's, with one change carried in the fork branch: `autoReadWrite` (default `"full"`) lets a `write` report a line count instead of echoing the whole file back, which is the same text upstream shows today when left at the default.

## Install

```bash
pi install git:github.com/qiansanyu/pi-hashline-edit-pro-lean@mine
```

`@mine` pins the branch that carries this fork's commits and depends on the runtime fork's `mine` branch. Drop the pin once that branch is merged into `main`.

Requires Pi `>=0.99.0`. Do not load another Hashline wrapper or the upstream package at the same time, or tools may be registered twice.

## Tools

```text
read
outline            # upstream's symbol map; upstream keeps it off by default
replace            # anchor-only: no path by default
replace_match      # exact substring inside an anchored range
insert             # anchor-only: no path by default
copy / move        # anchored line ranges, same or another file
grep               # anchored ripgrep; replaces Pi's built-in grep
undo_last_change   # still requires path
```

Always copy the five-character lowercase anchors returned by `read`, `grep`, or `outline`. Never invent anchors. `replace` and `insert` take one exact `text` string; line breaks inside it separate lines, and `text: ""` deletes the selected range in `replace`. Same-file edits in one message form one batch with a combined diff and a single undo.

Forgiving arguments: before validation, `replace` accepts the retired `replacement_text` / `replacement_lines` and `insert` accepts `lines` as `text`, and a `ref` equal to `path` is dropped before upstream rejects it as an unknown field. Anything ambiguous (including a missing `remove_to`, `path` or anchor) still fails validation.

## Configuration

Settings live in `~/.config/pi-hashline-edit-pro/config.json` (or `$PI_HASHLINE_DIR/config.json`) and are shared with upstream. Use `/hashline-config` to change them.

Defaults are upstream's: every tool but `outline` is on, and `outline` is off until you enable it in `/hashline-config`. Versions up to `6.4.5-lean.2` wrote `replaceMatchEnabled: false` (and older ones `copyMoveEnabled: false`) into the config on load; those values stay after upgrading, so turn the tools back on in `/hashline-config`, or set:

```json
{
  "copyMoveEnabled": true,
  "replaceMatchEnabled": true
}
```

Two upstream settings swap in Pi's plain tools: `anchorGrepEnabled: false` registers the built-in `grep`, and a model matched by `disableOnModels` gets the built-in `read` and `grep` with the edit tools off. Those plain tools keep Pi's own text.

## Upgrading from 4.x

- `replacement_lines` / `lines` arrays are replaced by the `text` string; `[]` becomes `""`.
- `anchor_grep` is now `grep` and replaces Pi's built-in `grep`.
- New `replace_match`, `copy`, and `move` tools, on by default and switchable in `/hashline-config`.
- A pure deletion verifies its boundary lines; interior lines that were never served are removed as they currently stand.

Start a fresh Pi session after upgrading so the model receives the new schemas and instructions.

## Versions

- Lean wrapper: `7.2.0-lean.1`
- Upstream runtime: `pi-hashline-edit-pro@7.2.0` (the runtime fork's `mine` branch)
- Pi: `>=0.99.0`
- Node.js: `>=22.19.0`

## Development

```bash
npm ci
npm run check
```

## License and upstream

MIT. This project wraps the MIT-licensed [`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro).
