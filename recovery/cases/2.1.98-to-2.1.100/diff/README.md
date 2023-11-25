# Exact 2.1.98 → 2.1.100 package payload

[package-members.json](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, mode-only changes, declaration changes, or native/vendor
changes. The target has 49,085,135 unpacked member bytes and framed tree
SHA-256
`77664e78764fb8a12061576b840eb3efa6cd9f0405b6189f6c8b2edca33a83f7`.

## JavaScript bundle

[cli.js.zstd-delta](cli.js.zstd-delta) is a Zstandard dictionary patch that
reconstructs the authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.98 `cli.js` | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |
| 2.1.100 `cli.js` | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |
| `cli.js.zstd-delta` | 1,471,024 | `17a70bec81bb61a95ff9b3ec1fd211dbd4c1d280f25c04c296aebe600a5a3f84` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  recovery/cases/2.1.98-to-2.1.100/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.100-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.98"` with `"version": "2.1.100"`. The 1,371-byte target has
SHA-256
`9883a3be5ed9a7b3dc917a9ae55fd5e98b5f9505ee8ba77a410dcc7d4557fcad`.

`package/sdk-tools.d.ts` is byte-identical across the adjacent published
releases: 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.
The manifest records this as `declarationChange.kind = "unchanged"`; no
declaration delta is needed.

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.98-to-2.1.100/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.98/package.tgz" \
  --output /tmp/claude-code-2.1.100-package
```

The verifier compares all 20 reconstructed members with the authenticated
published target and checks the complete framed tree hash. This proves the
published package bytes, not a complete reconstruction of authored source.
