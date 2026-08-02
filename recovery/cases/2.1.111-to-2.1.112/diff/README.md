# Exact 2.1.111 → 2.1.112 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Eighteen are unchanged and exactly two
changed: `package/cli.js` and the version-only `package/package.json`. There
are no additions, removals, declaration edits, or mode-only changes. The
target contains 49,328,681 unpacked member bytes and has framed-tree SHA-256
`938bdf827e5fa7181cff5360cb2f028447cf865bd26c129d1edbcaa8af377fac`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.111 `cli.js` | 13,711,605 | `8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0` |
| 2.1.112 `cli.js` | 13,711,684 | `bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f` |
| `cli.js.zstd-delta` | 1,028,916 | `c74631367b90863c7f521f096d806536e96de26c4536e1e9251d4a626d85844a` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  recovery/cases/2.1.111-to-2.1.112/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.112-cli.js
```

Replay produces the authenticated target bundle byte-for-byte, including the
target's `external-build-2239` provenance stamp.

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.111"` with `"version": "2.1.112"`. Both manifests are
1,371 bytes; their SHA-256 values are
`dd3725677684491b21ee5f3612f381505fd47a11f14fa067976d36a087b4e45a`
and
`56cd40fd6b7bb73da50ec9259805e3363150a5bc218b69d6dba5bd51a3f27cc0`.

`package/sdk-tools.d.ts` is byte-identical at 117,768 bytes, SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.

This directory establishes exact package and generated-JavaScript recovery.
It does not establish exact authored TypeScript spelling; that separate layer
is the reversible, source-facing overlay documented in
[`../REPORT.md`](../REPORT.md).
