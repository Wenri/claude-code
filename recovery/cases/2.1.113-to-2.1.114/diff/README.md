# Exact 2.1.113 → 2.1.114 recovery payloads

The npm wrapper remains a seven-member package. Six members are reused
byte-for-byte and only `package/package.json` changes. The complete target
wrapper contains 132,292 uncompressed member bytes and has framed-tree
SHA-256
`39c4b7cbbdcb93f859ae5d869c0d787bb79a82ede36148f1d6da064b8d675a2d`.

## Embedded JavaScript graph

All three plain-JavaScript entries in the authenticated Linux x64 Bun
container are recovered from the matching 2.1.113 entries with deterministic
Zstandard dictionary patches:

| Target | Target bytes | Target SHA-256 | Payload bytes | Payload SHA-256 |
| --- | ---: | --- | ---: | --- |
| `src/entrypoints/cli.js` | 12,986,845 | `5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83` | 3,574 | `8449f111593c4b652dd93cc44562e90eb101ee6a031eb6a44dba12261fafbd83` |
| `image-processor.js` | 2,564 | `3584c57d2720cfb8737009a2aa95f9ce0ec84d1b9512c238815a6ac088e7d346` | 26 | `079b103b475f6a99c5c6617661a4c394801ede23c3ec7a2b5499eda702cc2e4b` |
| `audio-capture.js` | 2,562 | `78b3c02e7e21fd59a59691381d04c5a1c562719c3bbe9697e945ae05f49526ad` | 26 | `e3bb6929091d635a6e2865f95efbd8a01baa1e5a9c74cb35dffb30ba931a55de` |

Together these files contain 12,991,971 bytes and have framed-tree SHA-256
`d2b3dcfaa0d29fc54e22bfebb77f307d5fc357058258a92dc84c3585799a983f`.
The fixed CommonJS wrapper around the CLI is preserved by the raw CLI patch;
the 12,986,755-byte wrapper interior used for analysis has SHA-256
`cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16`.

Replay the raw entrypoint, both helper modules, and package metadata with
their corresponding baseline entries:

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.js" \
  recovery/cases/2.1.113-to-2.1.114/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.114-cli.js --force

pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.113-linux-x64/image-processor.js" \
  recovery/cases/2.1.113-to-2.1.114/diff/image-processor.js.zstd-delta \
  -o /tmp/claude-code-2.1.114-image-processor.js --force

pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.113-linux-x64/audio-capture.js" \
  recovery/cases/2.1.113-to-2.1.114/diff/audio-capture.js.zstd-delta \
  -o /tmp/claude-code-2.1.114-audio-capture.js --force

pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.113/package/package.json" \
  recovery/cases/2.1.113-to-2.1.114/diff/package.json.zstd-delta \
  -o /tmp/claude-code-2.1.114-package.json --force
```

## npm package metadata

`package/package.json` remains 1,476 bytes. Its target SHA-256 is
`78cbd794a41f04d752ad58a13833fc6234e18c6b7c8012606d5327a2dcbe8fee`;
[`package.json.zstd-delta`](package.json.zstd-delta) is 55 bytes with SHA-256
`7d60915d1d85ec0d22db341882249ab634e82a2535f1450bf7586d1531597789`.
Like the two helper payloads, it is a dictionary patch rather than a
standalone Zstandard frame and therefore requires the exact 2.1.113 file.
The declarations are unchanged at 117,768 bytes, SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.

These payloads establish byte-exact generated-code and wrapper recovery. They
do not assert that erased TypeScript spelling, comments, formatting, or
module boundaries can be recovered from the source-map-free target.
