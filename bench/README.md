# bench

Two harnesses that turn "did the upgrade help?" into numbers instead of impressions.
Both drive the extension through a stub `pi` (the same shape `tests/render.test.mjs`
uses), so they exercise the real registration path.

```
node bench/dump-visible-text.mjs <label> [--upstream]   # model-facing text → bench/snapshots/
node bench/repro.mjs [--upstream]                       # upstream defect reproductions
```

`--upstream` swaps in `pi-hashline-edit-pro` itself instead of this wrapper, which is
what makes the wrapper's cost measurable: same harness, same settings, two targets.

## dump-visible-text

Counts every byte that reaches the model — tool `description`, `promptSnippet`, every
`promptGuidelines` line, and every JSON-Schema `description` (recursively) — for four
settings combinations, and writes a diffable `.txt` plus a detailed `.json`.

Baseline on 6.4.6 (`bench/snapshots/`):

| combo | lean | upstream | lean saves |
|---|---|---|---|
| default | 2 889 B | 16 298 B | 13 409 B (82%) |
| no replace_match / no copy-move | 2 709 B | 15 018 B | 12 309 B (82%) |
| autoRead off | 2 831 B | 15 209 B | 12 378 B (81%) |
| codemode | 4 666 B | 18 427 B | 13 761 B (75%) |

Upstream's bulk is `promptGuidelines` (8 926 B of 16 298 B) because 6.4.6 repeats the
shared rules — preference line, batch, path, diff, payload — on every tool. 7.x
deduplicates them (`b56f86d`), so re-running this after the bump is what tells us how
much of the wrapper's advantage survives.

## repro

Each case prints one `RESULT <case> key=value …` line so two runs can be diffed
directly. Recorded on 6.4.6:

```
RESULT crlf-dollar ok=true matchedRows=0
RESULT clipped-line servedLength=300 shownLength=203 retry="accepted" lineLengthAfter=203 saysRetryWithoutRead=true saysCallRead=false
RESULT huge-span status="not-reachable-from-tool-surface"
```

- **crlf-dollar** — ripgrep gets no `--crlf`, so `$` never matches in a CRLF file.
  Fixed in 7.1.1 (`src/grep.ts:320`); the case should report `matchedRows=1`.
- **clipped-line** — the `E_RANGE_STALE` feedback prints a 300-character line clipped
  to 203 characters yet marks it served and says "Retry with the fresh anchors above
  without a read". Retrying with what it shows rewrites the line as 203 characters.
  7.1.1 does not serve a clipped row and asks for a read; the case should report
  `retry="rejected"`, `lineLengthAfter=300`, `saysCallRead=true`.
- **huge-span** — the `>125k` element `RangeError` (`9353b11`) cannot be reached
  through the tool surface: a span that large cannot be served under the 50KB /
  2000-line cap, so the edit is refused earlier. Kept as a note so the case is not
  silently dropped.

Set `REPRO_DEBUG=1` to echo the error feedback the clipped-line case parses.
