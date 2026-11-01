# bench

Two harnesses that turn "did the upgrade help?" into numbers instead of impressions.
Both drive the extension through a stub `pi` (the same shape `tests/render.test.mjs`
uses), so they exercise the real registration path.

```
npm run bench            # this wrapper  -> bench/snapshots/<version>.{json,txt}
npm run bench:upstream   # bare upstream -> bench/snapshots/<version>-upstream.{json,txt}
npm run bench:repro      # upstream defect reproductions

node bench/dump-visible-text.mjs [label] [--upstream]   # label defaults to the version
```

`--upstream` swaps in `pi-hashline-edit-pro` itself instead of this wrapper, which is
what makes the wrapper's cost measurable: same harness, same settings, two targets.

## dump-visible-text

Counts every byte that reaches the model — tool `description`, `promptSnippet`, every
`promptGuidelines` line, and every JSON-Schema `description` (recursively) — for four
settings combinations, and writes a diffable `.txt` plus a detailed `.json`.

Baseline (`bench/snapshots/`):

| combo | lean 6.4.6 | upstream 6.4.6 | lean saves |
|---|---|---|---|
| default | 2 889 B | 16 298 B | 13 409 B (82%) |
| no replace_match / no copy-move | 2 709 B | 15 018 B | 12 309 B (82%) |
| autoRead off | 2 831 B | 15 209 B | 12 378 B (81%) |
| codemode | 4 666 B | 18 427 B | 13 761 B (75%) |

| combo | lean 7.1.1 | upstream 7.1.1 | lean saves |
|---|---|---|---|
| default | 3 415 B | 14 663 B | 11 248 B (77%) |
| no replace_match / no copy-move | 3 235 B | 14 024 B | 10 789 B (77%) |
| autoRead off | 3 323 B | 14 272 B | 10 949 B (77%) |
| codemode | 5 034 B | 16 476 B | 11 442 B (69%) |

The same table on 7.2.0 is byte-identical apart from the header lines: the only change
between 7.1.1 and 7.2.0 is upstream's post-write echo budget, which touches a
`tool_result`, not tool text. `diff bench/snapshots/7.1.1-lean.1.txt bench/snapshots/7.2.0-lean.1.txt`
shows two changed lines, both the version stamp.

Upstream's bulk on 6.4.6 is `promptGuidelines` (8 926 B of 16 298 B) because the shared
rules — preference line, batch, path, diff, payload — repeat on every tool. 7.1.1
deduplicates them (`b56f86d`) and trims descriptions, so upstream drops 1 635 B while
registering a ninth tool (`outline`, 2 272 B of untrimmed text). The wrapper's advantage
therefore falls from 82% to 65% *before* the wrapper itself is ported — that is the
number the port has to improve on, and the `outline` line is the largest single item
left unported.

Ported figures: 3 415 B for nine tools. `outline` contributes 351 B, so the eight tools
7.1.1 shares with 6.4.6 cost 3 064 B against 2 889 B — 175 B more, spent on the facts 7.x
added (send the edits you already have anchors for in one batch, rows the diff omits keep
their anchors, `match`/replacement semantics, and `outline`'s depth ladder).

`7.1.1-lean-unported` in `bench/snapshots/` keeps the pre-port run for reference: 5 147 B,
because `outline` passed through untrimmed at 2 272 B.

## repro

Each case prints one `RESULT <case> key=value …` line so two runs can be diffed
directly. Recorded on 6.4.6 (pre-bump) and 7.1.1 (post-bump), same script:

```
# 6.4.6
RESULT crlf-dollar ok=true matchedRows=0
RESULT clipped-line servedLength=300 shownLength=203 retryWithShownText="accepted" lineLengthAfterRetry=203 saysRetryWithoutRead=true saysCallRead=false
RESULT huge-span status="not-reachable-from-tool-surface"

# 7.1.1
RESULT crlf-dollar ok=true matchedRows=1
RESULT clipped-line servedLength=300 shownLength=203 retryWithShownText="accepted" lineLengthAfterRetry=203 saysRetryWithoutRead=false saysCallRead=true
RESULT huge-span status="not-reachable-from-tool-surface"
```

- **crlf-dollar** — ripgrep gets no `--crlf` before 7.1.1, so a dollar-anchored pattern
  never matched in a CRLF file: `matchedRows 0 -> 1` is the whole fix
  (upstream `src/grep.ts:320`).
- **clipped-line** — the `E_RANGE_STALE` feedback prints a 300-character line clipped to
  203 characters in both versions. What changed is the advice: 6.4.6 marks the row
  served and says "Retry with the fresh anchors above without a read"
  (`saysRetryWithoutRead=true`), 7.1.1 says "clipped above and not editable from here;
  call read()" (`saysCallRead=true`).
  `retryWithShownText` stays `accepted` in both, and that is worth being precise about:
  the line had already been served in full by the earlier read, and re-sent text is
  indistinguishable from an intentional edit, so 7.1.1's guard is the feedback contract,
  not a hard rejection. The keys to watch in a future bump are `saysRetryWithoutRead` /
  `saysCallRead`, not the retry.
- **huge-span** — the `>125k` element `RangeError` (`9353b11`) cannot be reached through
  the tool surface: a span that large cannot be served under the 50KB / 2000-line cap,
  so the edit is refused earlier. Kept as a note so the case is not silently dropped.

Set `REPRO_DEBUG=1` to echo the error feedback the clipped-line case parses.
