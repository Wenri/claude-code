# Bun binary extraction evidence

Claude Code 2.1.113 is the first release in this sequence whose wrapper npm
package does not publish `cli.js`. The signed wrapper installs a signed
platform package and replaces its 500-byte launcher stub with that package's
native executable.

For Linux x64, the authenticated executable is 236,411,520 bytes with SHA-256
`a81f7726b3b6b910e50c08a09f0090cb60714695d6d01bfe8698ff16cda9b87d`.
Its `.bun` section contains five directory records:

| Entry | Source bytes | Source SHA-256 | Extra bytecode |
| --- | ---: | --- | ---: |
| `src/entrypoints/cli.js` | 12,986,842 | `dda4d89e…036681` | 113,376,768 bytes |
| `image-processor.js` | 2,564 | `33c464d7…17c96` | — |
| `audio-capture.js` | 2,562 | `932257e6…c1c534` | — |
| `image-processor.node` | 1,458,720 | `b0809439…011183` | — |
| `audio-capture.node` | 492,232 | `64d636ca…a70d5` | — |

[`inventory.json`](./inventory.json) freezes the section, footer, directory,
pointer-bias, entry-point, module metadata, raw ranges, and hashes. The
repository verifier independently parses those records and compares every
derived artifact with its raw executable slice.

## Why direct slicing is canonical

`bun_graph` correctly discovered the graph, but `--extract` deliberately
rewrites JavaScript occurrences of `/$bunfs/root/` to the chosen output path.
That makes its extracted JavaScript path-dependent. The displayed Bun
`StringPointer` offsets also identify the eight bytes immediately before the
actual data.

The canonical rule is therefore:

```text
absolute file offset = .bun file offset + displayed pointer offset + 8
length               = displayed pointer length
```

For the CLI entry point this is:

```sh
dd if=claude of=cli.js \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=$((0x06714000 + 0x06c1fec0 + 8)) \
  count=12986842 status=none

sha256sum cli.js
# dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681
```

The raw CLI has an 87-byte Bun CommonJS wrapper prefix and a three-byte
suffix. Removing only those fixed bytes yields the 12,986,752-byte analyzable
bundle, SHA-256
`4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba`.
Both forms pass `node --check`; the wrapped form is the exact embedded source,
and the inner form is used for meaningful top-level structural comparison.

## Independent discovery tool

The discovery executable was pinned at 706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
Its captured output is [`bun-graph.txt`](./bun-graph.txt). The installed build
references a Nix runtime, so the run used the exact cached glibc 2.42,
source-highlight 3.1.9, Boost 1.89, and GCC 15.2 closures. It must be invoked
from source-highlight's data directory so `lang.map` is visible.

Replay does not depend on trusting that tool: `acquire-case.mjs` derives the
declared byte slices and `verify-bun-container.mjs` reparses and authenticates
the frozen graph independently.

