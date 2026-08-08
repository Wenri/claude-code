# Bun binary extraction evidence

Claude Code 2.1.114 continues the native-wrapper packaging introduced in
2.1.113: the wrapper npm package does not publish `cli.js`; its installer
selects a signed platform package and replaces the launcher stub with that
package's native executable.

The Linux x64 package tarball is 73,850,665 bytes with SHA-256
`c1123db5ac5003185686866f7431cc9c831e92c286bba2104382ca4403230195`.
Its SHA-1 (`c505e20dfeaef08d36d67ea5e8a6f9526e0366a0`) and SHA-512 SRI
(`sha512-4YX0ataEGqtgmXoYf97YQnbzh0xwegH4ZFP5d5LXBlJIXAB26cSIBNBPE+Eln8evguGJ9QzmHQBhSTdOl0DQAw==`)
match the registry metadata. The authenticated executable is 236,411,520
bytes with SHA-256
`12bd4b0916deb06be17ffc7b2f0485e140bf00b2db3dcb78469d66723d73c27f`.
Its `.bun` section contains five directory records:

| Entry | Source bytes | Source SHA-256 | Extra bytecode |
| --- | ---: | --- | ---: |
| `src/entrypoints/cli.js` | 12,986,845 | `5db5e219…162c83` | 113,376,784 bytes |
| `image-processor.js` | 2,564 | `3584c57d…e7d346` | — |
| `audio-capture.js` | 2,562 | `78b3c02e…9526ad` | — |
| `image-processor.node` | 1,458,720 | `b0809439…011183` | — |
| `audio-capture.node` | 492,232 | `64d636ca…a70d5` | — |

[`native-package-members.json`](./native-package-members.json) compares the
authenticated 2.1.113 and 2.1.114 Linux x64 packages exhaustively. All four
members remain present with identical modes: `LICENSE.md` and `README.md` are
unchanged, while `claude` and the native package manifest change. The exact
2.1.114 member tree contains 236,412,106 bytes and has framed SHA-256
`1523f540e0ed8d67a0cac4324c1d3b9e9cca5567b9600aceae621852bb71cfc8`.

[`inventory.json`](./inventory.json) freezes the section, footer, directory,
pointer bias, entry point, module metadata, raw ranges, and hashes. An
independent parser found `.bun` from the ELF64 section-name table (section 30),
decoded the 56-byte footer and all 52-byte directory records, inferred the
eight-byte pointer bias from the embedded module names, and hashed every raw
slice. Its values agree with [`bun-graph.txt`](./bun-graph.txt).

## Why direct slicing is canonical

`bun_graph` correctly discovered and extracted the graph, but `--extract`
deliberately rewrites JavaScript occurrences of `/$bunfs/root/` to the chosen
output path. That makes its extracted JavaScript path-dependent. The displayed
Bun `StringPointer` offsets also identify the eight bytes immediately before
the actual data.

The canonical rule is therefore:

```text
absolute file offset = .bun file offset + displayed pointer offset + 8
length               = displayed pointer length
```

For the CLI entry point this is:

```sh
dd if=claude of=cli.js \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=$((0x06714000 + 0x06c1fed0 + 8)) \
  count=12986845 status=none

sha256sum cli.js
# 5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83
```

The raw CLI has the same 87-byte Bun CommonJS wrapper prefix and three-byte
suffix as 2.1.113. Removing only those fixed bytes yields the 12,986,755-byte
analyzable bundle, SHA-256
`cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16`.
Both forms pass `node --check`. The wrapped form is the exact embedded source;
the inner form is suitable for top-level structural comparison.

`bun_graph --extract` was also cross-checked against direct slices. After
reversing its output-directory substitution, all three JavaScript files match
their slices byte-for-byte. The JSC cache and both native addons match directly
without canonicalization.

## Topology relative to 2.1.113

The graph topology is unchanged: five records in the same order, one CLI
module with JSC bytecode, two JavaScript helpers, and two native addons. The
entry point remains record zero, flags remain `0x0000000f`, and all module
metadata fields are identical.

The executable and `.bun` starting offset retain their previous sizes and
position, while the `.bun` section grows by 19 bytes. The JSC cache grows by 16
bytes, moving the CLI content 16 bytes later; the CLI grows by three bytes, so
every later record moves another three bytes. Both helper JavaScript modules
keep their byte lengths but change hashes. Both native addons retain their
exact 2.1.113 bytes and hashes.

## Independent discovery tool

The discovery executable is pinned at 706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
The installed build references a Nix runtime, so the run used the cached glibc
2.42, source-highlight 3.1.9, Boost 1.89, ICU 76.1, and GCC 15.2 closures. It
was invoked from source-highlight's data directory so `lang.map` was visible.

Replay does not depend on trusting that tool: the case acquisition derives the
declared byte slices, and `verify-bun-container.mjs` reparses and authenticates
the frozen graph independently.
