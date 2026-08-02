# Exact 2.1.110 → 2.1.111 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Eighteen are unchanged and exactly two
changed: `package/cli.js` and the version-only `package/package.json`. There
are no additions, removals, declaration edits, or mode-only changes. The
target contains 49,328,602 unpacked member bytes and has framed-tree SHA-256
`410cfb1d65e3924897162a6d682e46882208d71e32626a6001751740c2236bfb`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.110 `cli.js` | 13,609,982 | `cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861` |
| 2.1.111 `cli.js` | 13,711,605 | `8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0` |
| `cli.js.zstd-delta` | 2,129,673 | `2fdd4a69ac99a2db2a0c891a224bf4732c29317225ac53816e82e15d76f290b1` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  recovery/cases/2.1.110-to-2.1.111/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.111-cli.js
```

Replay produces the authenticated target bundle byte-for-byte, including the
target's `external-build-2172` provenance stamp.

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.110"` with `"version": "2.1.111"`. Both manifests are
1,371 bytes; their SHA-256 values are
`c27d3f1dc4b58cf3f42ae833ce1f8dbcc7d73dee645aec00c369b1a8d5e8e77b`
and
`dd3725677684491b21ee5f3612f381505fd47a11f14fa067976d36a087b4e45a`.

`package/sdk-tools.d.ts` is byte-identical at 117,768 bytes, SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.

This directory establishes exact package and generated-JavaScript recovery.
It does not establish exact authored TypeScript spelling; that separate layer
is the reversible, source-facing overlay documented in
[`../REPORT.md`](../REPORT.md).
