# Exact 2.1.107 → 2.1.108 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, or mode-only changes. The target contains 49,159,703
unpacked member bytes and has framed tree SHA-256
`277fff5e219e13fc935cc079a30b0e07818e5dc98e4f3eb1682a1dbf60048ba6`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.107 `cli.js` | 13,678,154 | `6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844` |
| 2.1.108 `cli.js` | 13,542,838 | `dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73` |
| `cli.js.zstd-delta` | 2,152,865 | `da4d79c4d04d888c1d634d7600609d09bac219fb8ad503783a3c5d33ef6797bc` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  recovery/cases/2.1.107-to-2.1.108/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.108-cli.js
```

Replay produces the authenticated target bundle byte-for-byte. This exact
generated recovery includes every generated-only change, including the
`external-build-2203` provenance stamp.

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.107"` with `"version": "2.1.108"`.

`package/sdk-tools.d.ts` is byte-identical between the releases: 117,636 bytes
with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

This directory establishes exact package and generated-JavaScript recovery.
It does not establish exact authored TypeScript spelling; that separate layer
is the partial, reversible source-facing overlay documented in
[`../REPORT.md`](../REPORT.md).
