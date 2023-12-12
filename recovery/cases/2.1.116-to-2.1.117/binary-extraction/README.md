# Bun binary extraction evidence

Claude Code 2.1.117 retains the native-wrapper packaging introduced in
2.1.113: the wrapper npm package does not publish `cli.js`; its installer
selects a platform package and installs that package's native executable.

The Linux x64 package tarball is 74,512,900 bytes with SHA-256
`f01a62806aa4dd02d728463fbe3237517c8b6fe98f640e62c5dd59b48a68eaa1`.
Its SHA-1 (`7d7e2106970e92654c5d82ad56c126de7e0f482c`) and SHA-512 SRI
(`sha512-bhN6qnc9xchKQqKWdwuZazEeSO+9NIhOPcoD/WgqTK5QRPSAwnvo5SZWIQUbkNbTKLaMwuxAu3u+Fj/jYbiidg==`)
match the registry metadata. The registry ECDSA/SHA-256 signature
`MEUCIQDUymbxQflsibDfoYq28KKCAIPKbssiUho979lCvEJezQIgHBj/rmNW7BgE8R6GHIAnv92KP0had6nmBupG7SgB7zA=`
verifies against non-expiring key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The authenticated
executable is 238,451,328 bytes with SHA-256
`b7246963d9e32ece439c3e1e7885f53773a4820e90a4d2433ef2a413a055a5fe`.

An independent ELF64 little-endian parser found `.bun` as section 30 from the
section-name string table. The ELF section table starts at 238,448,640, has 42
64-byte records, and uses record 41 as its string table. The `.bun` section and
its independently decoded container structures are:

| Structure | Half-open executable range | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `.bun` section | `[108658688, 238446320)` | 129,787,632 | `f807907c7c5e395ff1d8bf76183c99d482eb7f498f22c2a91d638a19b1cb0333` |
| 56-byte footer | `[238446264, 238446320)` | 56 | `5cc43599a5575d611c5dff775dbb937acae8fd4598aaa2632eb62fa77f79c351` |
| five-record directory | `[238446011, 238446271)` | 260 | `05376e5cd0691a9f40ec1d831b70ea1c85bb8ed5cf10652b4aec96ee4b6cb89f` |

The footer declares byte count 129,787,576, directory pointer
`{off=129787315,len=260}`, entry-point record zero, empty `exec_argv`, and
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
| CLI JSC bytecode | `[108658816, 223375632)` | 114,716,816 | `b0e7090810db1c77bf10c2023a4b7f27059ed8899c59d7b3a9a21b42bf1b4549` |
| `src/entrypoints/cli.js` | `[223375704, 236489912)` | 13,114,208 | `092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744` |
| `image-processor.js` | `[236489945, 236492509)` | 2,564 | `142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4` |
| `audio-capture.js` | `[236492540, 236495102)` | 2,562 | `9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5` |
| `image-processor.node` | `[236495137, 237953793)` | 1,458,656 | `418c92f2e5d688ecf0fe24ab490123c7bdb6d62ca72983431244665f179a4405` |
| `audio-capture.node` | `[237953826, 238446010)` | 492,184 | `7e89edf4dde9b69b6c55a310788ad999e2d0dd469d8a31c529cf28f3ea5e929c` |

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
  skip=$((0x067a0000 + 0x06d67150 + 8)) \
  count=13114208 status=none

sha256sum cli.js
# 092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744
```

The raw CLI has the same 87-byte Bun CommonJS wrapper prefix and three-byte
suffix as 2.1.116. Removing only those fixed bytes yields the 13,114,118-byte
analyzable bundle, SHA-256
`518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661`.
Both raw and inner CLI forms pass `node --check`; both directly sliced helper
JavaScript files pass it as well. The wrapped form is the exact embedded
source, while the inner form is suitable for top-level structural comparison.

`bun_graph --extract` was cross-checked using extraction root
`/home/coder/.cache/claude-code-recovery/2.1.116-to-2.1.117-bun-extract/bun-graph-extract`.
Its 94-byte replacement prefix is 81 bytes longer than `/$bunfs/root/`.
The two CLI replacements therefore increased the file by 162 bytes, and the
one replacement in each helper increased those files by 81 bytes. Reversing
the rewrite made all three JavaScript outputs byte-identical to the direct
slices. The JSC cache and both native addons match their direct slices without
canonicalization.

## Topology relative to 2.1.116

The graph topology is unchanged: five records in the same order, one CLI
module with JSC bytecode, two JavaScript helpers, and two native addons. The
entry point remains record zero, flags remain `0x0000000f`, and every module
metadata field is identical.

The `.bun` start moves forward 573,440 bytes and its size grows by 223,206
bytes. That size change is accounted for exactly by the JSC cache growing
211,472 bytes, the raw CLI growing 11,846 bytes, `image-processor.node`
shrinking 64 bytes, and `audio-capture.node` shrinking 48 bytes. The two helper
JavaScript lengths remain 2,564 and 2,562 bytes. All six content/JSC hashes
change. The complete executable grows by 798,720 bytes; the remaining growth
comes from 573,440 bytes before `.bun` and 2,074 bytes after it.

The CLI name and content displayed offsets move by the JSC increase. The
image helper, audio helper, and image addon move by 223,318 bytes, the combined
JSC and CLI increase. The final audio addon moves by 223,254 bytes because the
preceding image addon is 64 bytes smaller. The directory pointer moves by the
net 223,206-byte `.bun` growth.

## Independent discovery tool and stable slices

The discovery executable is pinned at 706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
The installed build references a Nix runtime, so the run used the cached glibc
2.42, source-highlight 3.1.9, Boost 1.89, ICU 76.1, and GCC 15.2 closures. It
was invoked from source-highlight's data directory so `lang.map` was visible.

Replay does not depend on trusting that tool: canonical outputs use only
authenticated executable byte slices. The independent parser separately read
the ELF section-name table, decoded the footer and all directory records, and
verified every range and hash. The stable tarball, executable, `.bun` section,
raw CLI, inner CLI, JSC, helpers, native addons, directory, and footer from this
run are under
`/home/coder/.cache/claude-code-recovery/2.1.116-to-2.1.117-bun-extract/2.1.117-linux-x64`.
