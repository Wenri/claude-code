# Structural generated-code ledger

This ledger compares the authenticated 2.1.112 `cli.js` with the exact
2.1.113 Bun-wrapper interior. Removing the fixed 87-byte prefix and
three-byte suffix is a lossless container normalization; it prevents the
entire target from appearing as one CommonJS IIFE statement.

The format and minifier transition is much larger than the authored release
delta, so conservative unresolved pairing is expected. It never means target
code is absent: every one of the 4,051,255 target tokens is present in the
exact recovered bundle and classified exactly once.

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 11,404 | 2,005,441 |
| Moved candidate | 1,617 | 22,684 |
| Coarse changed candidate | 403 | 142,629 |
| Unresolved pairing | 7,023 | 1,880,501 |
| **Total** | **20,447** | **4,051,255** |

The exact structural fraction is approximately 50.06%; the resolved fraction
is approximately 53.58%. These figures quantify pairing confidence, not
recovery completeness.

