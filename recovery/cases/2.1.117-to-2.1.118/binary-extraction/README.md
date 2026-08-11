# Bun binary extraction evidence

Claude Code 2.1.118 retains the native-wrapper packaging introduced in
2.1.113: the wrapper npm package does not publish `cli.js`; its installer
selects a platform package and installs that package's native executable.

The Linux x64 package tarball is 75,226,490 bytes with SHA-256
`9265b84455ce045a77e89a822ddeed6dabfbb920a4cda5e8f38ef1ec55d7c45c`.
Its SHA-1 (`2378ea67ec21d77880bb38549d17c5a402d727e4`) and SHA-512 SRI
(`sha512-t6aNIvNa1T+ZR5IkJARqjTy+U5LH59FuWok4QoXa/RpT4C0njeeE/SdUzvvhwmH3ji/Rh6EX4zgbx/v5yGtG8Q==`)
match the registry metadata. The registry ECDSA/SHA-256 signature
`MEYCIQDauxWcphcdldLpfBnCoO2Z5KNvegbAJ9DVVAQnDWuz4QIhAJ9VuhHbQKrD55Cy/PE9hr1vgiYxMnZdSySF9K2xoTKm`
verifies against non-expiring key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The authenticated
executable is 239,573,632 bytes with SHA-256
`ba363b2410a47120d2d4b8ece2e11fe0bbc5d59adb1329e8fb87ea0f370f4e46`.

An independent ELF64 little-endian parser found `.bun` as section 30 from the
section-name string table. The ELF section table starts at 239,570,944, has 42
64-byte records, and uses record 41 as its string table. The `.bun` section and
its independently decoded container structures are:

| Structure | Half-open executable range | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `.bun` section | `[108707840, 239569428)` | 130,861,588 | `25feab553b06f5b590a7fc34aa9f2e4d59d82a744a0e7fed45ee0d507841b408` |
| 56-byte footer | `[239569372, 239569428)` | 56 | `a6ae37bffe2c78da59862217caddb95cd63f0bad1ab9d0e394ef65c0bafada08` |
| five-record directory | `[239569119, 239569379)` | 260 | `71910fc60ea00aa902d479524fa5715053622fc61bd50dd8613f4930f4288f43` |

The footer declares byte count 130,861,532, directory pointer
`{off=130861271,len=260}`, entry-point record zero, empty `exec_argv`, and
flags `0x0000000f`. Its eight-byte prefix is `000000000a000100` and its
trailer is `\n---- Bun! ----\n`. The directory consists of five 52-byte
records with no remainder.

## Canonical module slices

[`inventory.json`](./inventory.json) freezes the section, footer, directory,
pointer bias, entry point, module metadata, raw ranges, and hashes. The
independent parser inferred the eight-byte pointer bias by locating the entry
point name, then hashed every raw slice. Its results agree with
[`bun-graph.txt`](./bun-graph.txt).

| Entry | Half-open executable range | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| CLI JSC bytecode | `[108707968, 224378240)` | 115,670,272 | `38fe828a95e7e29df80878d6bbef0efe06b18b7a6e83e81310486845763a0909` |
| `src/entrypoints/cli.js` | `[224378312, 237613020)` | 13,234,708 | `fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba` |
| `image-processor.js` | `[237613053, 237615617)` | 2,564 | `d0e8787dfe93a0e0134631d8f72ef91bbfbc8b22bdc5fc8a6f8b4ddbe30571e4` |
| `audio-capture.js` | `[237615648, 237618210)` | 2,562 | `8f6b51633d314e510bb1824b4e19aedb0c4c03e17738fdc3a9199b264be04a4e` |
| `image-processor.node` | `[237618245, 239076901)` | 1,458,656 | `418c92f2e5d688ecf0fe24ab490123c7bdb6d62ca72983431244665f179a4405` |
| `audio-capture.node` | `[239076934, 239569118)` | 492,184 | `7e89edf4dde9b69b6c55a310788ad999e2d0dd469d8a31c529cf28f3ea5e929c` |

### Why direct slicing is canonical

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
  skip=$((0x067ac000 + 0x06e4fdc0 + 8)) \
  count=13234708 status=none

sha256sum cli.js
# fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba
```

The raw CLI has the same 87-byte Bun CommonJS wrapper prefix and three-byte
suffix as 2.1.117. Removing only those fixed bytes yields the 13,234,618-byte
analyzable bundle, SHA-256
`84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa`.
Both raw and inner CLI forms pass `node --check`; both directly sliced helper
JavaScript files pass it as well. The wrapped form is the exact embedded
source, while the inner form is suitable for top-level structural comparison.

`bun_graph --extract` was cross-checked using extraction root
`/home/coder/.cache/claude-code-recovery/2.1.117-to-2.1.118-bun-extract/bun-graph-extract`.
Its 94-byte replacement prefix is 81 bytes longer than `/$bunfs/root/`.
The two CLI replacements therefore increased the file by 162 bytes, and the
one replacement in each helper increased those files by 81 bytes. Reversing
the rewrite made all three JavaScript outputs byte-identical to the direct
slices. The JSC cache and both native addons match their direct slices without
canonicalization.

## Topology relative to 2.1.117

The graph topology is unchanged: five records in the same order, one CLI
module with JSC bytecode, two JavaScript helpers, and two native addons. The
entry point remains record zero, flags remain `0x0000000f`, and every module
metadata field is identical.

The `.bun` start moves forward 49,152 bytes and its size grows by 1,073,956
bytes. That size change is accounted for exactly by the JSC cache growing
953,456 bytes and the raw CLI growing 120,500 bytes. Both helper JavaScript
lengths remain 2,564 and 2,562 bytes, and both native addons retain their
lengths and hashes. The JSC, raw CLI, and both helper JavaScript hashes change.

The complete executable grows by 1,122,304 bytes: 49,152 bytes are added
before `.bun`, the section itself grows by 1,073,956 bytes, and the bytes after
the section shrink by 804. The Linux x64 tarball grows by 713,590 compressed
bytes.

The CLI name and content displayed offsets move by the JSC increase. Every
later module and the directory pointer move by the combined 1,073,956-byte JSC
and CLI increase. Their absolute file ranges move by 1,123,108 bytes after
also accounting for the `.bun` start shift.

## Independent discovery tool and stable slices

The discovery executable is pinned at 706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
The installed build references a Nix runtime, so the run used the cached glibc
2.42, source-highlight 3.1.9, Boost 1.89, ICU 76.1, and GCC 15.2 closures. It
was invoked from source-highlight's data directory so `lang.map` was visible.

Replay does not depend on trusting that tool: canonical outputs use only
authenticated executable byte slices. The independent parser separately read
the ELF section-name table, decoded the footer and all directory records, and
verified every range and hash. The authenticated tarballs, extracted package
members, executable, raw and inner CLI, JSC cache, helpers, and native addons
from this run are under
`/home/coder/.cache/claude-code-recovery/2.1.117-to-2.1.118/artifacts`. The
path-rewritten discovery outputs are retained separately under
`/home/coder/.cache/claude-code-recovery/2.1.117-to-2.1.118-bun-extract`.
