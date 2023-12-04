# Exact 2.1.108 → 2.1.109 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, or mode-only changes. The target contains 49,160,435
unpacked member bytes and has framed-tree SHA-256
`d44addbf39a4d0265d529a8b93de2d8641c1ec8e5d288f833b6a9bb30bbe277b`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.108 `cli.js` | 13,542,838 | `dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73` |
| 2.1.109 `cli.js` | 13,543,570 | `3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7` |
| `cli.js.zstd-delta` | 1,800,138 | `e80feeb44fb51733ff0e2d0abaeb23008ce56a6de4b7daecd7407cb4e131b478` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  recovery/cases/2.1.108-to-2.1.109/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.109-cli.js
```

Replay produces the authenticated target bundle byte-for-byte. This exact
generated recovery includes every target byte, including the
`external-build-2193` provenance stamp.

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.108"` with `"version": "2.1.109"`.

`package/sdk-tools.d.ts` is byte-identical between the releases: 117,636 bytes
with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

This directory establishes exact package and generated-JavaScript recovery.
It does not establish exact authored TypeScript spelling; that separate layer
is the reversible, source-facing overlay documented in
[`../REPORT.md`](../REPORT.md).
