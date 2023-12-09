# Binding-aware readable bundle diff

This directory contains a deterministic comparison view of the complete
2.1.88 and 2.1.89 generated bundles:

- `normalized.diff.gz` is the full Git-style diff after placing every
  top-level statement on its own line and safely renaming 2.1.89
  Program-scope bindings when a unique structural counterpart exists.
- `statements.diff` is a compact diff of statement type and
  scope-normalized structural hash.
- `renames.tsv` records the 16,254 accepted target-to-baseline binding names.
- `metadata.json` pins every input, output, intermediate, rejection reason,
  and comparison-invariant hash.

Unsafe or ambiguous renames are rejected. The rewritten target parses, and
its comparison-invariant hash is identical before renaming, after 87,233
identifier edits, and after line normalization.

To inspect the full text:

```sh
gzip -cd normalized.diff.gz | less
```

To regenerate from pinned artifacts:

```sh
pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline /path/to/2.1.88/cli.js \
  --target /path/to/2.1.89/package/cli.js \
  --output /tmp/2.1.88-to-2.1.89-readable-diff \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

This is a non-executable comparison representation. JavaScript can observe
binding spelling through constructs such as direct `eval`, `Function.name`,
or source-text inspection, so the invariant is intentionally not described
as proof of runtime equivalence. The published target bytes remain the
executable oracle and are recovered by the exact Zstandard delta.
