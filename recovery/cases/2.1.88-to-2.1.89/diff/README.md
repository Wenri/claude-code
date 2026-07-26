# Exact generated-code delta

`cli.js.zstd-delta` is a deterministic Zstandard dictionary patch from the
pinned 2.1.88 `cli.js` to the pinned, published 2.1.89 `cli.js`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.88 `cli.js` | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| `cli.js.zstd-delta` | 2,249,231 | `33be2f1480544cbe09873fe610d5a01c66bf9bb025594637c93f3c915158db6d` |
| Reconstructed 2.1.89 `cli.js` | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |

Reconstruct directly:

```sh
zstd -d \
  --patch-from=/path/to/2.1.88/cli.js \
  cli.js.zstd-delta \
  -o /path/to/reconstructed-2.1.89-cli.js
```

Or rebuild and verify the delta against both pinned inputs:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline /path/to/2.1.88/cli.js \
  --target /path/to/2.1.89/cli.js \
  --output recovery/cases/2.1.88-to-2.1.89/diff/cli.js.zstd-delta \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

The script always reconstructs the target in a temporary directory and
compares every byte before reporting `exact-delta-verified`. This delta
recovers the complete published executable. It does not claim to restore
TypeScript syntax, comments, erased types, or the original module boundaries.
