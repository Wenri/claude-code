# Exact 2.1.114 → 2.1.116 recovery payloads

These six deterministic Zstandard dictionary patches recover every changed
plain-JavaScript entry in the authenticated Linux x64 Bun container and every
changed member of the seven-member npm wrapper. Fresh generation with
Zstandard 1.5.7 produced payloads byte-for-byte identical to the checked
files, and replay of every checked payload reproduced its authenticated target
byte-for-byte. The six payloads contain 2,368,603 bytes in total.

## Embedded JavaScript graph

| Target | 2.1.114 bytes | 2.1.114 SHA-256 | 2.1.116 bytes | 2.1.116 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `src/entrypoints/cli.js` | 12,986,845 | `5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83` | 13,102,362 | `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193` | 2,368,314 | `098a28617bf941d4f07e713e7c7c83fe42b2e8fe73ded87e7052554806ee3195` |
| `image-processor.js` | 2,564 | `3584c57d2720cfb8737009a2aa95f9ce0ec84d1b9512c238815a6ac088e7d346` | 2,564 | `002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e` | 26 | `d3096f2e256c3e3d6be94dfc2da1d07db87bb05ab7a0d2da50c38448544ddcb3` |
| `audio-capture.js` | 2,562 | `78b3c02e7e21fd59a59691381d04c5a1c562719c3bbe9697e945ae05f49526ad` | 2,562 | `e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3` | 26 | `2cad5c9e7701cf4731176c2adb0ce11d91603f6f9dfb17d2f67eb09541fe1c8b` |

Together the target files contain 13,107,488 bytes and have framed-tree
SHA-256
`e0f43f765bb8cf903dfda2bdfe0feb7549d5a4b9b4202de61c4bd9b21df97190`.
The framing, in table order, is
`path + NUL + decimal byte count + NUL + file SHA-256 + LF`. The fixed Bun
CommonJS wrapper remains part of the raw CLI patch; its analyzable interior is
13,102,272 bytes with SHA-256
`d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a`.

## npm wrapper

The wrapper topology is unchanged: four of seven members are reused
byte-for-byte and these three members change. The target wrapper contains
132,486 uncompressed member bytes and has framed-tree SHA-256
`5cf546a554e481b32f4633be6f883c8740b05f34a359142e9665a591011e90c0`.

| Target | 2.1.114 bytes | 2.1.114 SHA-256 | 2.1.116 bytes | 2.1.116 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `package/install.cjs` | 6,252 | `65bc65f48812b25124dc49e3c08b0264c70c0485333fa736a280f6a1c4e7a98a` | 6,307 | `574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2` | 68 | `62c04322bc3a754cd9f23240d285d2e12f47a59e4a36313590eb9b1e3717b1d3` |
| `package/package.json` | 1,476 | `78cbd794a41f04d752ad58a13833fc6234e18c6b7c8012606d5327a2dcbe8fee` | 1,476 | `7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931` | 55 | `cd78fdf420bb20fe9ac6cd6bebb5e160ba6464a452be9bc5b416897a39b21030` |
| `package/sdk-tools.d.ts` | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` | 117,907 | `ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc` | 114 | `fd3a761626c32f046a99ff9426c36f6398f616a29d8dc6ecf013eb0bb0319774` |

## Reproducible generation and replay

Set `RECOVERY_ARTIFACTS` to the directory containing the authenticated,
extracted `2.1.114`, `2.1.114-linux-x64`, `2.1.116`, and
`2.1.116-linux-x64` directories. This clean-room replay writes only to two
fresh temporary directories. `build-exact-delta.mjs` validates both endpoint
hashes, creates a new patch, and verifies its reconstruction; `cmp` then proves
that the new payload equals the checked payload and that replay of the checked
payload equals the published target.

```sh
case_dir=recovery/cases/2.1.114-to-2.1.116
generated_dir=$(mktemp -d /tmp/claude-code-2.1.116-deltas.XXXXXX)
reconstructed_dir=$(mktemp -d /tmp/claude-code-2.1.116-replay.XXXXXX)

verify_payload() {
  payload_name=$1
  baseline_relative=$2
  target_relative=$3
  baseline_sha256=$4
  target_sha256=$5

  pixi run node recovery/scripts/build-exact-delta.mjs \
    --baseline "$RECOVERY_ARTIFACTS/$baseline_relative" \
    --target "$RECOVERY_ARTIFACTS/$target_relative" \
    --output "$generated_dir/$payload_name.zstd-delta" \
    --expected-baseline-sha256 "$baseline_sha256" \
    --expected-target-sha256 "$target_sha256"

  cmp "$generated_dir/$payload_name.zstd-delta" \
    "$case_dir/diff/$payload_name.zstd-delta"

  pixi run zstd -d \
    --patch-from="$RECOVERY_ARTIFACTS/$baseline_relative" \
    "$case_dir/diff/$payload_name.zstd-delta" \
    -o "$reconstructed_dir/$payload_name" --force

  cmp "$reconstructed_dir/$payload_name" \
    "$RECOVERY_ARTIFACTS/$target_relative"
}

verify_payload cli.js \
  2.1.114-linux-x64/cli.js 2.1.116-linux-x64/cli.js \
  5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83 \
  06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193
verify_payload image-processor.js \
  2.1.114-linux-x64/image-processor.js \
  2.1.116-linux-x64/image-processor.js \
  3584c57d2720cfb8737009a2aa95f9ce0ec84d1b9512c238815a6ac088e7d346 \
  002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e
verify_payload audio-capture.js \
  2.1.114-linux-x64/audio-capture.js \
  2.1.116-linux-x64/audio-capture.js \
  78b3c02e7e21fd59a59691381d04c5a1c562719c3bbe9697e945ae05f49526ad \
  e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3
verify_payload install.cjs \
  2.1.114/package/install.cjs 2.1.116/package/install.cjs \
  65bc65f48812b25124dc49e3c08b0264c70c0485333fa736a280f6a1c4e7a98a \
  574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2
verify_payload package.json \
  2.1.114/package/package.json 2.1.116/package/package.json \
  78cbd794a41f04d752ad58a13833fc6234e18c6b7c8012606d5327a2dcbe8fee \
  7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931
verify_payload sdk-tools.d.ts \
  2.1.114/package/sdk-tools.d.ts 2.1.116/package/sdk-tools.d.ts \
  98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d \
  ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc
```

These payloads establish byte-exact generated-code and wrapper recovery. They
do not assert recovery of erased TypeScript spelling, comments, formatting, or
original module boundaries from the source-map-free executable.
