# Exact 2.1.104 → 2.1.105 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Seventeen are unchanged and three changed:
`package/cli.js`, `package/sdk-tools.d.ts`, and the version-only
`package/package.json`. There are no additions, removals, or mode-only
changes. The target contains 49,293,780 unpacked member bytes and has framed
tree SHA-256
`eb72a564decf7f00f8ba598bc7d3d8ecec452d1f220ff07e1fbcafd7184e110a`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.104 `cli.js` | 13,567,412 | `ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39` |
| 2.1.105 `cli.js` | 13,676,915 | `8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75` |
| `cli.js.zstd-delta` | 2,157,702 | `615daafb1b4c92d98e9339ee8d9c40104fed840eb1c2b2b64186cf30823f24f0` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  recovery/cases/2.1.104-to-2.1.105/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.105-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.104"` with `"version": "2.1.105"`.

The 161-byte [`sdk-tools.d.ts.zstd-delta`](sdk-tools.d.ts.zstd-delta)
reconstructs the exact 117,636-byte declaration target. The manifest also
records an independent unique text edit adding `EnterWorktreeInput.path`.
