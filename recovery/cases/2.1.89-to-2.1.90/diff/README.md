# Exact 2.1.89 → 2.1.90 bundle delta

`cli.js.zstd-delta` is a deterministic Zstandard dictionary patch. It
reconstructs the authenticated 2.1.90 `cli.js` exactly from the authenticated
2.1.89 `cli.js`.

```sh
pixi run zstd -d \
  --patch-from="$ARTIFACTS/2.1.89/package/cli.js" \
  recovery/cases/2.1.89-to-2.1.90/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.90-cli.js

wc -c /tmp/claude-code-2.1.90-cli.js
sha256sum /tmp/claude-code-2.1.90-cli.js
```

Expected target:

- bytes: `13,128,331`
- SHA-256:
  `069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9`

The committed delta is `1,985,545` bytes with SHA-256
`a9f3e0b9fc736ae1129cc4e8ffcd82c9327e08f8d91be8e7cd3ca46540b7089e`.
`build-exact-delta.mjs` reconstructs and byte-compares the target before
accepting the delta.
