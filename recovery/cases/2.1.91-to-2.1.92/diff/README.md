# Exact 2.1.91 → 2.1.92 package payloads

`cli.js.zstd-delta` is a deterministic Zstandard dictionary patch. It
reconstructs the authenticated 2.1.92 `cli.js` exactly from the authenticated
2.1.91 `cli.js`.

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  recovery/cases/2.1.91-to-2.1.92/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.92-cli.js

wc -c /tmp/claude-code-2.1.92-cli.js
sha256sum /tmp/claude-code-2.1.92-cli.js
```

Expected target:

- bytes: `13,221,767`
- SHA-256:
  `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362`

The committed delta is `2,285,915` bytes with SHA-256
`125d66c66450debe0d6220fb5e351946095224e78de75d61b214908a89fa124a`.
`build-exact-delta.mjs` reconstructs and byte-compares the target before
accepting the delta.

2.1.92 also adds two exact package-member payloads. They are deterministic
level-19, single-threaded Zstandard frames:

| Package member | Payload bytes | Payload SHA-256 | Reconstructed bytes | Reconstructed SHA-256 |
| --- | ---: | --- | ---: | --- |
| `package/vendor/seccomp/arm64/apply-seccomp` | 240,857 | `3e3c4e804c4b88303f80a635eff83f5138812274aa34c2fbe1fd695e2851fbe6` | 603,200 | `e547755917a7343619e80a00a192842e125ee00454a3ee1e11af4fae0504315e` |
| `package/vendor/seccomp/x64/apply-seccomp` | 294,356 | `5a973d6bfedaf645979b2ebd8886799ef7f682fb277d96ed88f2e72deea3485a` | 751,624 | `b46118d36051d364b8857fd182251b209f8b339cb5772a0f81e814aba3c23a10` |

Reproduce either compressed payload with:

```sh
pixi run zstd -19 --single-thread --no-progress --force \
  /path/to/apply-seccomp \
  -o /path/to/apply-seccomp.zst
```

Decompress with `pixi run zstd -d PAYLOAD -o OUTPUT`, then compare the byte
count and SHA-256 above.
