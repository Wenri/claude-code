# Exact 2.1.90 → 2.1.91 bundle delta

`cli.js.zstd-delta` is a deterministic Zstandard dictionary patch. It
reconstructs the authenticated 2.1.91 `cli.js` exactly from the authenticated
2.1.90 `cli.js`.

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.90/package/cli.js" \
  recovery/cases/2.1.90-to-2.1.91/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.91-cli.js

wc -c /tmp/claude-code-2.1.91-cli.js
sha256sum /tmp/claude-code-2.1.91-cli.js
```

Expected target:

- bytes: `13,162,543`
- SHA-256:
  `b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816`

The committed delta is `1,934,216` bytes with SHA-256
`2039573574ae6167b61b030212587cd842b698ccb91cec3cce2eba1988b7ee57`.
`build-exact-delta.mjs` reconstructs and byte-compares the target before
accepting the delta.
