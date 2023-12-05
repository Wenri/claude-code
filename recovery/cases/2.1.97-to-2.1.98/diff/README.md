# Exact 2.1.97 → 2.1.98 package payload

[package-members.json](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs pass
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
additions, removals, mode-only changes, declaration changes, or native/vendor
changes. The target has 49,087,707 unpacked member bytes and framed tree
SHA-256
`850b956fe51eb41bb07b0a3fcc59b1c18cf3aa7cb06bab6961d0d290c096c8f0`.

## JavaScript bundle

[cli.js.zstd-delta](cli.js.zstd-delta) is a Zstandard dictionary patch that
reconstructs the authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.97 `cli.js` | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |
| 2.1.98 `cli.js` | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |
| `cli.js.zstd-delta` | 2,383,732 | `12ec0a9f269c9fe3b6653ef06887dcfb5d8bd56503201ed0994beb0bf0d4a7f3` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  recovery/cases/2.1.97-to-2.1.98/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.98-cli.js
```

## Metadata and declarations

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.97"` with `"version": "2.1.98"`. The 1,370-byte target has
SHA-256
`d1673e42af42b9b781b597d02b13867d00fb0322e8072899d7452476ae3a1ce8`.

`package/sdk-tools.d.ts` is byte-identical across the adjacent releases:
117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.
The manifest records this as `declarationChange.kind = "unchanged"`; no
declaration delta is needed.

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.97-to-2.1.98/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.97/package.tgz" \
  --output /tmp/claude-code-2.1.98-package
```

The verifier compares all 20 reconstructed members with the authenticated
published target and checks the complete framed tree hash.
