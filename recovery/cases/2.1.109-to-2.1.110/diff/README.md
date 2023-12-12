# Exact 2.1.109 → 2.1.110 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Seventeen are unchanged and three changed:
`package/cli.js`, the version-only `package/package.json`, and
`package/sdk-tools.d.ts`. There are no additions, removals, or mode-only
changes. The target contains 49,226,979 unpacked member bytes and has
framed-tree SHA-256
`23e2c220198c2c0ad0e58670acd27a652e41afe5ff5f76f49999112f6cf7a77e`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.109 `cli.js` | 13,543,570 | `3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7` |
| 2.1.110 `cli.js` | 13,609,982 | `cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861` |
| `cli.js.zstd-delta` | 2,117,328 | `2aa2cd3fea6c56d795996c15134af802f27439074dc2dc368a209735479b8965` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  recovery/cases/2.1.109-to-2.1.110/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.110-cli.js
```

Replay produces the authenticated target bundle byte-for-byte. This exact
generated recovery includes every target byte, including the
`external-build-2205` provenance stamp.

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.109"` with `"version": "2.1.110"`.

`package/sdk-tools.d.ts` grows from 117,636 bytes, SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`,
to 117,768 bytes, SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.
The exact insertion adds the optional `userModified?: boolean` field to the
write-tool permission result.

This directory establishes exact package and generated-JavaScript recovery.
It does not establish exact authored TypeScript spelling; that separate layer
is the reversible, source-facing overlay documented in
[`../REPORT.md`](../REPORT.md).
