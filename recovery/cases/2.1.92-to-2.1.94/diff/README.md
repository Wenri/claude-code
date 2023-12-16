# Exact 2.1.92 → 2.1.94 package payloads

The npm registry did not publish `2.1.93`. This case therefore uses `2.1.92`
as the authenticated baseline for the next published version, `2.1.94`.

`package-members.json` exhaustively compares every tar member by path, type,
link target, mode, byte count, and SHA-256. Both tarballs passed their
registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature checks under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

The package remains at 20 members. Eight are unchanged and twelve changed;
there are no additions or removals. The target has 48,924,688 unpacked member
bytes and framed tree SHA-256
`bf795adc3f8d22228c0eb81c38f0049b1dfa9f71ef93a23f9a0e5ab1d7737c89`.

## JavaScript bundle

`cli.js.zstd-delta` is a Zstandard dictionary patch. It reconstructs the
authenticated target bundle exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.92 `cli.js` | 13,221,767 | `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362` |
| 2.1.94 `cli.js` | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |
| `cli.js.zstd-delta` | 2,021,935 | `654793f39daa8d8cdce358999a8f0ebc63811b1c4a233dcfba91c2958fe5ad73` |

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  recovery/cases/2.1.92-to-2.1.94/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.94-cli.js
```

## Changed vendor members

Four audio-capture binaries and all six ripgrep binaries changed. Each
committed payload is another exact Zstandard dictionary patch; it must be
decoded with the same member from the 2.1.92 package as its dictionary.

| Package member | Target bytes | Target SHA-256 | Patch bytes | Patch SHA-256 |
| --- | ---: | --- | ---: | --- |
| `vendor/audio-capture/arm64-darwin/audio-capture.node` | 438,112 | `df2e6621a220ba25679631acf6a56a226e1a3f793e349d3e870b7e81efbcb9a5` | 138 | `25f8cd5d19a06c176770dcecb1c2c02b1e9dcb0ec743c2cafb526408326c5506` |
| `vendor/audio-capture/arm64-win32/audio-capture.node` | 471,040 | `34ea5d9499c5f45ed1ed8f7be88f74ef36917daadf3ff867027c1780aa222a1e` | 138 | `3b3077a3833345bc6cfea4e28967d9c9cff874eeb1dd66513f8aefc2edda7e09` |
| `vendor/audio-capture/x64-darwin/audio-capture.node` | 439,076 | `325437a9f1c2e94d95b47b983a64fccfd256d4fcf0802bdb28dfebcdbee8ae9b` | 99 | `092e20f3e6a796daf6f1268f41d4d263a6b9cb69c6e8fdd39518b23e47236a3b` |
| `vendor/audio-capture/x64-win32/audio-capture.node` | 509,440 | `a007b7dcb8e0658f36ed78e2122497b41b099cd7a11a0f22f4b215c3bd04cfd8` | 139 | `e2ad2f24077d7fb270af31450a99cf39b41f9d96da63ce668111b6f352d1d6ee` |
| `vendor/ripgrep/arm64-darwin/rg` | 4,522,704 | `098870a072d0426e10c9717aab3c2ddaac48c4b7820b008043099cbab84a6533` | 884,996 | `9eed704bddd41d5de2fba8ed884d6e37fa2577292d8fd2659d68ca201eb56230` |
| `vendor/ripgrep/arm64-linux/rg` | 5,182,680 | `545e43ce2e5adcae7de8b4e09e7d9cf7fe079e95bd2e7614ac4bd059bddc8052` | 1,066,103 | `6015cb6a8f6171d1c9b75aa5b7e308022cb9fc78b84e8106a2013599f2af1267` |
| `vendor/ripgrep/arm64-win32/rg.exe` | 4,700,160 | `149c433749d4f9c0dd5d051f6c85890e8576839b902e172e25e5901d006eced3` | 989,691 | `9e12fa66d8bc603753dc6a309f489f9c8156b1110937c7bf700dd10757fae254` |
| `vendor/ripgrep/x64-darwin/rg` | 5,080,600 | `f681c574c5c08500647005b81a4f1b038f4a583ba3c7b9e7950f9d90f89d2170` | 965,440 | `ca4d46f155949be219168ed6306c33428d647d41ca326317907876f02fe585e9` |
| `vendor/ripgrep/x64-linux/rg` | 6,526,864 | `2ac4328af42c90fca0e2bdc701433d6beb79c9c5bbbc3f412eff50f90d10da75` | 1,410,144 | `ebaca455e97479c6c33ad811a9e991401181147739aa32c636fd1713fea84b47` |
| `vendor/ripgrep/x64-win32/rg.exe` | 5,319,168 | `9157977356926a9f7ad77e18a8493aa625ef29d919a9556f5218efe36acafae4` | 1,049,035 | `f536d44e053cb17e53fa5e6a70be3e7e00856e5fb73f47e92c693bb48a6f67cf` |

For a member named `$MEMBER`, reproduce its target bytes with:

```sh
mkdir -p "$(dirname "/tmp/$MEMBER")"
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.92/package/$MEMBER" \
  "recovery/cases/2.1.92-to-2.1.94/diff/package/$MEMBER.zstd-delta" \
  -o "/tmp/$MEMBER"
```

The manifest records these files in
`generatedRecovery.packageMembers.changedMemberPayloads` with algorithm
`zstd-dictionary-patch`. The package reconstructor requires exactly one
authenticated recipe for every otherwise unsupported changed member and
rejects missing, duplicate, unused, or unsafe recipes.

## Metadata recipes

`package/package.json` is reconstructed by uniquely replacing
`"version": "2.1.92"` with `"version": "2.1.94"`. Its target is 1,370 bytes
with SHA-256
`9fe686f624114c3837e0b8d65f132dd202b584e8742796365e5e4d3fc40b1736`.
No insertion is required.

`package/sdk-tools.d.ts` is byte-identical in both versions: 117,138 bytes,
SHA-256
`d54800cb26dbfc3e15d0ab034ef9c77e340fb7ec76270a167f39245f7155c4b4`.

Run the complete reconstruction through the case manifest:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.92-to-2.1.94/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.92/package.tgz" \
  --output /tmp/claude-code-2.1.94-package
```

The verifier compares every reconstructed member against its authenticated
published target bytes and checks the complete framed tree hash.
