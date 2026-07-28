# Exact 2.1.101 → 2.1.104 package payload

[package-members.json](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, mode-only changes, declaration changes, or native/vendor
changes. The target has 49,184,019 unpacked member bytes and framed tree
SHA-256
`f8ba1d1fce88baa057d762ddd3d1fb0991cf2af28c2d446e3a8fa2bc1d025d8a`.

## JavaScript bundle

[cli.js.zstd-delta](cli.js.zstd-delta) is a Zstandard dictionary patch that
reconstructs the authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.101 `cli.js` | 13,566,090 | `bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb` |
| 2.1.104 `cli.js` | 13,567,412 | `ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39` |
| `cli.js.zstd-delta` | 1,017,736 | `70e938e84daf3811df350cfc299addec232a2bc94c89595f536624c39dfaa54c` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  recovery/cases/2.1.101-to-2.1.104/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.104-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.101"` with `"version": "2.1.104"`. The 1,371-byte target has
SHA-256
`106ae47f9c512d342200edc3ef24dc93e26a61a75a4983118da8a73386cf6b0e`.

`package/sdk-tools.d.ts` is byte-identical across the adjacent published
releases: 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.
No declaration delta is needed.

