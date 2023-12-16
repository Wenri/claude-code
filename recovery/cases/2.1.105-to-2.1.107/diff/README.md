# Exact 2.1.105 → 2.1.107 package payload

[`package-members.json`](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, or mode-only changes. The target contains 49,295,019
unpacked member bytes and has framed tree SHA-256
`090976e2da071c4328e567c954cfaeea6dea96cc604e0809f3bdcdc45ac2fe64`.

## JavaScript bundle

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.105 `cli.js` | 13,676,915 | `8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75` |
| 2.1.107 `cli.js` | 13,678,154 | `6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844` |
| `cli.js.zstd-delta` | 952,059 | `8fbad613638ebb1c4bddf024a19d99e2cae10df29a3159ad86f5fdf82af459ae` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  recovery/cases/2.1.105-to-2.1.107/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.107-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.105"` with `"version": "2.1.107"`.

`package/sdk-tools.d.ts` is byte-identical between the releases: 117,636 bytes
with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.
