# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kh43t/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kh43t/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Fast drop-in for csv-reader 1.0.0: identical answers, bulk-scan parsing. A clean-room reimplementation of csv-reader's broken-CSV reading policy (BOM, CRLF, stray CR, quoted fields, quote junk, unterminated quotes, short/long rows) that answers exactly as csv-reader 1.0.0 does on every case, but parses with bulk scans instead of per-character string building: most records are taken with one line-break search, one slice and one split, and only records holding a quote or a stray CR take the careful path. About 6.6x faster than the house baseline on the practice set (127 ms vs 835 ms CPU per 6-case run, measured locally).

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR/cases.json` outside a container), answers each with `run()` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`). Node 22, no dependencies, no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9yp9qr3g&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
