# Exact 2.1.116 → 2.1.117 recovery payloads

These four deterministic Zstandard dictionary patches recover every changed
plain-JavaScript entry in the authenticated Linux x64 Bun container and every
changed member of the seven-member npm wrapper. Fresh generation with
Zstandard 1.5.7 produced payloads byte-for-byte identical to the checked
files, and replay of every checked payload reproduced its authenticated target
byte-for-byte. The four payloads contain 2,152,309 bytes in total.

## Embedded JavaScript graph

| Target | 2.1.116 bytes | 2.1.116 SHA-256 | 2.1.117 bytes | 2.1.117 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `src/entrypoints/cli.js` | 13,102,362 | `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193` | 13,114,208 | `092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744` | 2,152,169 | `01556afe1725f6fa803ab8e5450a610e729a04614232d542a8f823f412dfe978` |
| `image-processor.js` | 2,564 | `002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e` | 2,564 | `142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4` | 26 | `21d3bd19f121d42892de53864fff0961bd38c1ac3fa5a384520643d371cca99d` |
| `audio-capture.js` | 2,562 | `e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3` | 2,562 | `9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5` | 59 | `37d5829d38143325c21e13039a2388863bbf1358f1365012af619dcfbbe5f73f` |

Together the target files contain 13,119,334 bytes and have framed-tree
SHA-256
`26598d0fb6db81ebd03970649741d81b9bdae1499b325e7c502a885bb47ad447`.
The framing, in table order, is
`path + NUL + decimal byte count + NUL + file SHA-256 + LF`. The fixed Bun
CommonJS wrapper remains part of the raw CLI patch; its analyzable interior is
13,114,118 bytes with SHA-256
`518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661`.

## npm wrapper

The wrapper topology is unchanged: six of seven members are reused
byte-for-byte and only `package/package.json` changes. The target wrapper
contains 132,486 uncompressed member bytes and has framed-tree SHA-256
`5989877c00805b29590a870dc429703e04d625c9830e99611bf67144e5b01dbd`.

| Target | 2.1.116 bytes | 2.1.116 SHA-256 | 2.1.117 bytes | 2.1.117 SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `package/package.json` | 1,476 | `7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931` | 1,476 | `e247be0d290213d920e55404d7efe8282ba4885d4ea6d044f4422dd2d0d80e48` | 55 | `ed5b4af4f18e27b2fc73203f9ca61ec670e44b5afaa799c5f155066eb0b886fd` |

## Reproducible generation and replay

Set `RECOVERY_ARTIFACTS` to the directory containing the authenticated,
extracted `2.1.116`, `2.1.116-linux-x64`, `2.1.117`, and
`2.1.117-linux-x64` directories. This clean-room replay writes only to two
fresh temporary directories. `build-exact-delta.mjs` validates both endpoint
hashes, creates a new patch, and verifies its reconstruction; `cmp` then proves
that the new payload equals the checked payload and that replay of the checked
payload equals the published target.

```sh
case_dir=recovery/cases/2.1.116-to-2.1.117
generated_dir=$(mktemp -d /tmp/claude-code-2.1.117-deltas.XXXXXX)
reconstructed_dir=$(mktemp -d /tmp/claude-code-2.1.117-replay.XXXXXX)

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
  2.1.116-linux-x64/cli.js 2.1.117-linux-x64/cli.js \
  06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193 \
  092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744
verify_payload image-processor.js \
  2.1.116-linux-x64/image-processor.js \
  2.1.117-linux-x64/image-processor.js \
  002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e \
  142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4
verify_payload audio-capture.js \
  2.1.116-linux-x64/audio-capture.js \
  2.1.117-linux-x64/audio-capture.js \
  e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3 \
  9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5
verify_payload package.json \
  2.1.116/package/package.json 2.1.117/package/package.json \
  7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931 \
  e247be0d290213d920e55404d7efe8282ba4885d4ea6d044f4422dd2d0d80e48
```

These payloads establish byte-exact generated-code and wrapper recovery. They
do not assert recovery of erased TypeScript spelling, comments, formatting, or
original module boundaries from the source-map-free executable.
