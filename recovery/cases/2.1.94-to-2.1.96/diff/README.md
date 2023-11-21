# Exact 2.1.94 → 2.1.96 package payload

The npm registry did not publish `2.1.95`. This case therefore uses `2.1.94`
as the authenticated baseline for the next published version, `2.1.96`.

`package-members.json` compares every tar member by path, type, link target,
mode, byte count, and SHA-256. Both tarballs passed their registry SHA-1,
SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eighteen are unchanged and two changed:
`package/cli.js` and the version-only `package/package.json`. There are no
added, removed, mode-only, declaration, or vendor changes. The target has
48,924,836 unpacked member bytes and framed tree SHA-256
`17d169a1338c92dd7dd42f8f64627ba14d206e27c36db5826995fc0c4aff9446`.

## JavaScript bundle

`cli.js.zstd-delta` is a Zstandard dictionary patch that reconstructs the
authenticated target exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.94 `cli.js` | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |
| 2.1.96 `cli.js` | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |
| `cli.js.zstd-delta` | 319,590 | `0739b86c55b23697173396ef29737191f45ef0ad9c1479e4666484842f67d1c5` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  recovery/cases/2.1.94-to-2.1.96/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.96-cli.js
```

## Metadata recipe

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.94"` with `"version": "2.1.96"`. No other metadata
transformation is required.

`package/sdk-tools.d.ts` is byte-identical in both releases: 117,138 bytes,
SHA-256
`d54800cb26dbfc3e15d0ab034ef9c77e340fb7ec76270a167f39245f7155c4b4`.
Every native and vendor member is also byte-identical, so this case needs no
member-specific payload recipes.

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.94-to-2.1.96/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.94/package.tgz" \
  --output /tmp/claude-code-2.1.96-package
```

The verifier compares all 20 reconstructed members with the authenticated
published target and checks the complete framed tree hash.
