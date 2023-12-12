# Exact 2.1.117 → 2.1.118 recovery payloads

These five deterministic Zstandard dictionary patches recover every changed
plain-JavaScript entry in the authenticated Linux x64 Bun container and every
changed member of the seven-member npm wrapper. Fresh generation with
Zstandard 1.5.7 produced payloads byte-for-byte identical to the checked
files, and replay of every checked payload reproduced its authenticated target
byte-for-byte. The five payloads contain 2,163,251 bytes in total.

## Embedded JavaScript graph

| Target | 2.1.117 bytes | 2.1.117 SHA-256 | 2.1.118 bytes | 2.1.118 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `src/entrypoints/cli.js` | 13,114,208 | `092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744` | 13,234,708 | `fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba` | 2,163,102 | `0d40b1c7e77f84ab4a556d602c5558b717499fc41d13fdc0ed4a9e11be08d38a` |
| `image-processor.js` | 2,564 | `142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4` | 2,564 | `d0e8787dfe93a0e0134631d8f72ef91bbfbc8b22bdc5fc8a6f8b4ddbe30571e4` | 26 | `c6924760c5d1cba5845ba7a84fd9338b59544f1dc181023526ab65f6684d3745` |
| `audio-capture.js` | 2,562 | `9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5` | 2,562 | `8f6b51633d314e510bb1824b4e19aedb0c4c03e17738fdc3a9199b264be04a4e` | 26 | `c66a32b27641fd6233342e34bbc4d3e0635e5229ac8c2d7885969b969ab1c71c` |

Together the target files contain 13,239,834 bytes and have framed-tree
SHA-256
`ace0550ae45d75efbd936921f235c9eebc9950fa2d53e418f9541553f136c3eb`.
The framing, in table order, is
`path + NUL + decimal byte count + NUL + file SHA-256 + LF`. The fixed Bun
CommonJS wrapper remains part of the raw CLI patch; its analyzable interior is
13,234,618 bytes with SHA-256
`84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa`.

## npm wrapper

The wrapper topology is unchanged: five of seven members are reused
byte-for-byte and two members change. The target wrapper contains 132,031
uncompressed member bytes and has framed-tree SHA-256
`72c0c29d2bf08d2309560c7496ae91a2c1282b2f452ec484114f971d67a99094`.

| Target | 2.1.117 bytes | 2.1.117 SHA-256 | 2.1.118 bytes | 2.1.118 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `package/package.json` | 1,476 | `e247be0d290213d920e55404d7efe8282ba4885d4ea6d044f4422dd2d0d80e48` | 1,476 | `fd9eba95cb868d4c06c42fca9707a51139b6b0b4aa8e1c1826b356b58d09befc` | 55 | `fd575b5b8b8c7e545143b0d60390de480ebce5c86857c8acd243597cfda9c3c7` |
| `package/sdk-tools.d.ts` | 117,907 | `ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc` | 117,452 | `8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf` | 42 | `cfef2bc8501a0437416c9fcec9033a029831e689fb57e452d20dfa6ad1c0ddd0` |

The package manifest changes only the root and eight optional platform
dependency versions. The declaration patch exactly removes `ConfigInput` and
`ConfigOutput` from their unions and definitions.

## Reproducible generation and replay

Set `RECOVERY_ARTIFACTS` to the directory containing the authenticated,
extracted `2.1.117`, `2.1.117-linux-x64`, `2.1.118`, and
`2.1.118-linux-x64` directories. This clean-room replay writes only to two
fresh temporary directories. `build-exact-delta.mjs` validates both endpoint
hashes, creates a new patch, and verifies its reconstruction; `cmp` then proves
that the new payload equals the checked payload and that replay of the checked
payload equals the published target.

```sh
case_dir=recovery/cases/2.1.117-to-2.1.118
generated_dir=$(mktemp -d /tmp/claude-code-2.1.118-deltas.XXXXXX)
reconstructed_dir=$(mktemp -d /tmp/claude-code-2.1.118-replay.XXXXXX)

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
  2.1.117-linux-x64/cli.js 2.1.118-linux-x64/cli.js \
  092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744 \
  fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba
verify_payload image-processor.js \
  2.1.117-linux-x64/image-processor.js \
  2.1.118-linux-x64/image-processor.js \
  142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4 \
  d0e8787dfe93a0e0134631d8f72ef91bbfbc8b22bdc5fc8a6f8b4ddbe30571e4
verify_payload audio-capture.js \
  2.1.117-linux-x64/audio-capture.js \
  2.1.118-linux-x64/audio-capture.js \
  9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5 \
  8f6b51633d314e510bb1824b4e19aedb0c4c03e17738fdc3a9199b264be04a4e
verify_payload package.json \
  2.1.117/package/package.json 2.1.118/package/package.json \
  e247be0d290213d920e55404d7efe8282ba4885d4ea6d044f4422dd2d0d80e48 \
  fd9eba95cb868d4c06c42fca9707a51139b6b0b4aa8e1c1826b356b58d09befc
verify_payload sdk-tools.d.ts \
  2.1.117/package/sdk-tools.d.ts 2.1.118/package/sdk-tools.d.ts \
  ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc \
  8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf
```

These payloads establish byte-exact generated-code and wrapper recovery. They
do not assert recovery of erased TypeScript spelling, comments, formatting, or
original module boundaries from the source-map-free executable.
