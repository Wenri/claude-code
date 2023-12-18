# Exact 2.1.96 → 2.1.97 package payload

[package-members.json](../package-members.json) compares every tar member by
path, type, link target, mode, byte count, and SHA-256. Both tarballs passed
their registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Seventeen are unchanged and three changed:
`package/cli.js`, the version-only `package/package.json`, and
`package/sdk-tools.d.ts`. There are no additions, removals, mode-only changes,
or native/vendor changes. The target has 48,991,994 unpacked member bytes and
framed tree SHA-256
`c616574993d24d0d99db6597dac55c7b03074d7b3134ae1aa91f1dfff48c189c`.

## JavaScript bundle

[cli.js.zstd-delta](cli.js.zstd-delta) is a Zstandard dictionary patch that
reconstructs the authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.96 `cli.js` | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |
| 2.1.97 `cli.js` | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |
| `cli.js.zstd-delta` | 2,389,730 | `98f02e8e2ab14afc0e2d68db5939072b5ef363b8adb7b6a087deb2a5d8a3a57c` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  recovery/cases/2.1.96-to-2.1.97/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.97-cli.js
```

## Metadata and declaration recipes

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.96"` with `"version": "2.1.97"`. The 1,370-byte target has
SHA-256
`87ed8af4262ba703827fb702b1243899879188db6666bbef5c7f75f62fb32d4b`.

The manifest's `targetAssertions.declarationExactEdits` is the authoritative
recipe for `package/sdk-tools.d.ts`. It applies an ordered insertion of the
optional seven-counter `toolStats` object and the exact replacement that
widens `FileEditToolResult.originalFile` from `string` to `string | null`.
Every `{anchor, text}` or `{from, to}` match must be unique in the baseline;
edits must be ordered and non-overlapping, and the verifier compares the
complete replayed file with the published target. The target is 117,378 bytes
with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.

[sdk-tools.d.ts.zstd-delta](sdk-tools.d.ts.zstd-delta) is a redundant,
independent binary cross-check of the same declaration recovery. It is 113
bytes with SHA-256
`83e00e75ff62a2436e54e3dd0ba7f5e90fcfca59bd3a012eeca2fe91e9efde54`;
it is intentionally not a `changedMemberPayloads` recipe because
`declarationExactEdits` already reconstructs that member exactly.

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.96/package/sdk-tools.d.ts" \
  recovery/cases/2.1.96-to-2.1.97/diff/sdk-tools.d.ts.zstd-delta \
  -o /tmp/claude-code-2.1.97-sdk-tools.d.ts
```

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.96-to-2.1.97/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.96/package.tgz" \
  --output /tmp/claude-code-2.1.97-package
```

The verifier compares all 20 reconstructed members with the authenticated
published target and checks the complete framed tree hash.
