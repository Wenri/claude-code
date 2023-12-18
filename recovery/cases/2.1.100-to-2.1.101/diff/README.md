# Exact 2.1.100 → 2.1.101 package payload

[package-members.json](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, mode-only changes, declaration changes, or native/vendor
changes. The target has 49,182,697 unpacked member bytes and framed tree
SHA-256
`31db03d726238058bb691208a6e0c3698ff0e2384c1ef7c4d9a5925e5736d154`.

## JavaScript bundle

[cli.js.zstd-delta](cli.js.zstd-delta) is a Zstandard dictionary patch that
reconstructs the authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.100 `cli.js` | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |
| 2.1.101 `cli.js` | 13,566,090 | `bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb` |
| `cli.js.zstd-delta` | 2,096,082 | `afebd886bd0b9fa19862e9d6dab101ab32b014508c9bec8772853a0a8da22088` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  recovery/cases/2.1.100-to-2.1.101/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.101-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.100"` with `"version": "2.1.101"`. The 1,371-byte target has
SHA-256
`b24c2b43b9d276ebe81495691a59c659be0e1b601012e249603c6c2106a0af69`.

`package/sdk-tools.d.ts` is byte-identical across the adjacent published
releases: 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.
The manifest records this as `declarationChange.kind = "unchanged"`; no
declaration delta is needed.

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.100-to-2.1.101/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.100/package.tgz" \
  --output /tmp/claude-code-2.1.101-package
```

The verifier compares all 20 reconstructed members with the authenticated
published target and checks the complete framed tree hash. This proves the
published package bytes, not a complete reconstruction of authored source.
