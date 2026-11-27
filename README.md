# makefun-diff-speed-20261127

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/kangrisuk-id/makefun-diff-speed-20261127/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/kangrisuk-id/makefun-diff-speed-20261127/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

![diff-sprint: byte-exact makefun-diff 1.0.0 patches, 3.05× faster](assets/hero.svg)

**diff-sprint** is a faster drop-in replacement for make.fun's own makefun-diff 1.0.0. Its `run(input)` returns, for every case's `{ old, new }` pair of texts, exactly the patch string makefun-diff 1.0.0 returns — the same edit script, the same tie-breaks, byte for byte — and on the practice set it computes those patches **3.05× faster** than the reference (685 ms vs 2,088 ms of `run()` time over the 4 practice cases, median of 5 runs).

## At a glance

| | |
| --- | --- |
| What | `solve.js` — a dependency-free ES module whose `run({ old, new })` returns makefun-diff 1.0.0's patch, plus `main.ts`, the harness driver |
| Speed | **3.05× the reference** on the practice set (per case 2.76×–3.38×, median of 5 warm runs, same machine) |
| Exactness | Byte-identical to the vendored makefun-diff oracle on **80,887** test cases (see Verification) |
| Method | Typed-array Myers search: one `Int32Array` frontier row per edit depth, the script read back off the rows replaying the reference's own choice rule |
| Runtime | Node 22, no dependencies, nothing installed, no network |
| Determinism | Two executions on the same input produce byte-identical output (verified) |

## Gallery

| | |
| --- | --- |
| ![Benchmark: practice-set run() time per case, diff-sprint vs makefun-diff](assets/benchmark.svg) | ![A real patch for a one-word change](assets/patch.svg) |
| *Practice set, `run()` time per case (median of 5 warm runs on one machine): diff-sprint totals 685 ms against makefun-diff's 2,088 ms.* | *A real patch from this entry: one word changed in a nine-line text. The header counts lines, hunks, deletions and insertions; each hunk shows up to 3 kept lines of context around its changes.* |

## How it works

The reference is jsdiff's Myers search rebuilt on path objects: every diagonal step allocates linked-list nodes, and the patch is assembled from those objects. diff-sprint keeps the reference's exact decision rule and changes only the machinery:

- **Lines become numbers.** Each text is split after every `\n` (a `\r` stays part of its line, and a last line without `\n` is a line too, newline included in the comparison). Distinct lines are interned to integer ids through one `Map`, so the search compares `Int32Array` entries instead of strings.
- **Trim, then search.** The common prefix of lines is kept, then the common suffix of what is left; Myers's greedy search runs between them, exactly as specified: on each diagonal the path reaching furthest into the old text wins, a deletion beats an insertion that reaches the same point, no step leaves either text, no edge diagonal is pruned, and every snake is followed to its end.
- **Rows, not objects.** For each edit depth `d` the search stores one `Int32Array` row: the furthest old position reached on every diagonal, `-1` where no path of `d` edits reaches. The script is then read back from the far end, at each depth replaying the same comparison the search itself made — so the recovered script is the search's own path, not merely a shortest one.
- **The patch** is formatted directly from the runs: change runs list deletions before insertions, hunks carry up to 3 kept lines of context and merge runs at most 6 kept lines apart, and a line that ends its text without a newline is written with one and followed by a `%` line. Identical texts produce the header alone.

## Verification

Every answer was compared byte for byte against the kit's vendored makefun-diff 1.0.0 oracle:

| Suite | Cases | Result |
| --- | ---: | --- |
| Practice set (the kit's own) | 4 | identical, and the full driver's `answers.json` is byte-identical to the baseline's |
| Small fuzz (tiny alphabets, heavy repetition, CRLF mixes, mutations) | 80,000 | 0 mismatches |
| Mid-size fuzz (200–3,000 lines, block moves, run growth/shrinkage) | 800 | 0 mismatches |
| Full-size sets drawn by the competition's own generator from fresh seeds | 32 | 0 mismatches |
| Hand-built edges (empty texts, missing trailing newlines, CRLF↔LF, unicode, lone surrogates, 100k-char lines, repeated-line runs, reversed texts) | 49 | 0 mismatches |
| Stress beyond the generator's range (40,000 lines, 10% replaced; a 3,000-line block moved end to end) | 2 | identical, with the whole set far inside the time and memory budget |

The two-executions-must-match rule is covered by determinism: the program has no randomness, no clock and no cross-case state, and two full driver runs on the practice set produce byte-identical output files.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (default `/input`), answers each one alone with `run()` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json` (default `/output`). It runs on Node 22.18 or later, which runs its TypeScript as it is.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6xwwxtxr&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
