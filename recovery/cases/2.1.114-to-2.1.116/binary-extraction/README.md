# Bun binary extraction evidence

Claude Code 2.1.116 uses the native-wrapper packaging introduced in 2.1.113:
the wrapper npm package does not publish `cli.js`; its installer selects a
signed platform package and replaces the launcher stub with that package's
native executable.

The Linux x64 package tarball is 74,153,663 bytes with SHA-256
`0dde548c698cee7174751a92426123e90a95f56bf09271423681dd883d8bf0ea`.
Its SHA-1 (`70fc945e30491431f44e546f12e300bdc2c8c902`) and SHA-512 SRI
(`sha512-XLlgIItxdjhr4DpSNx7eWmNtVWeCqRtaXoly58lFObpyU1Fq3HAbY//+nmqVirWKFK2BjVXLa/iq9y64+SZ4kg==`)
match the registry metadata. The registry ECDSA/SHA-256 signature verifies
against non-expiring key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The authenticated
executable is 237,652,608 bytes with SHA-256
`0d1aea5ce056a5ce491da7e9bbe63f992585e5c24852f023a07c8f18cf292cc5`.

An independent ELF64 little-endian parser found `.bun` as section 30 from the
section-name string table. The ELF section table starts at 237,649,920, has 42
64-byte records, and uses record 41 as its string table. The `.bun` section and
its independently decoded container structures are:

| Structure | Half-open executable range | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `.bun` section | `[108085248, 237649674)` | 129,564,426 | `1e3df6cda488cc24b9fad09354d1d18fca960af3e41869005eb8727bf3be061a` |
| 56-byte footer | `[237649618, 237649674)` | 56 | `5d3a681d710d12a5faf8a2b368dc67c5265991c5c111e4bd94e3813b493bd59d` |
| five-record directory | `[237649365, 237649625)` | 260 | `91c5547eccd1244fe42b676b8493b8a6ea7e736df10c9e3300a15fd50e4d76ec` |

The footer declares byte count 129,564,370, directory pointer
`{off=129564109,len=260}`, entry-point record zero, empty `exec_argv`, and
flags `0x0000000f`. Its eight-byte prefix is `000000000a000100` and its
trailer is `\n---- Bun! ----\n`. The directory consists of five 52-byte
records with no remainder.

## Canonical module slices

[`inventory.json`](./inventory.json) freezes the section, footer, directory,
pointer bias, entry point, module metadata, raw ranges, and hashes. The
independent parser inferred the eight-byte pointer bias from the embedded
module names and hashed every raw slice. Its results agree with
[`bun-graph.txt`](./bun-graph.txt).

| Entry | Half-open executable range | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| CLI JSC bytecode | `[108085376, 222590720)` | 114,505,344 | `6a2ef89e26373afa29462f6edc4eb41bd516b95be89cd9c872efe3d8cc2c7ec3` |
| `src/entrypoints/cli.js` | `[222590792, 235693154)` | 13,102,362 | `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193` |
| `image-processor.js` | `[235693187, 235695751)` | 2,564 | `002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e` |
| `audio-capture.js` | `[235695782, 235698344)` | 2,562 | `e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3` |
| `image-processor.node` | `[235698379, 237157099)` | 1,458,720 | `b0809439e025557d26ea49bbc4914686b5c8dd80d5b03547bf00ce17e8101183` |
| `audio-capture.node` | `[237157132, 237649364)` | 492,232 | `64d636ca4accaaacbef22340b4864591c7858361066952e79e8dd618080a70d5` |

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
  skip=$((0x06714000 + 0x06d33740 + 8)) \
  count=13102362 status=none

sha256sum cli.js
# 06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193
```

The raw CLI has the same 87-byte Bun CommonJS wrapper prefix and three-byte
suffix as 2.1.114. Removing only those fixed bytes yields the 13,102,272-byte
analyzable bundle, SHA-256
`d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a`.
Both raw and inner CLI forms pass `node --check`; both directly sliced helper
JavaScript files pass it as well. The wrapped form is the exact embedded
source, while the inner form is suitable for top-level structural comparison.

`bun_graph --extract` was cross-checked using extraction root
`/tmp/claude-21116-bun-graph-extract`. Its two CLI replacements increased the
file by 56 bytes, and its one replacement in each helper increased those files
by 28 bytes. Replacing that extraction-root prefix back with `/$bunfs/root/`
made all three JavaScript outputs byte-identical to the direct slices. The JSC
cache and both native addons match their direct slices without
canonicalization.

## Topology relative to 2.1.114

The graph topology is unchanged: five records in the same order, one CLI
module with JSC bytecode, two JavaScript helpers, and two native addons. The
entry point remains record zero, flags remain `0x0000000f`, and all module
metadata fields are identical.

The `.bun` starting offset remains 108,085,248. Its size grows by exactly
1,244,077 bytes: the JSC cache grows by 1,128,560 bytes and the raw CLI grows
by 115,517 bytes. The JSC still begins at displayed offset 120. The CLI name
and content move forward by the JSC increase; all records after the CLI move
forward by the combined increase. The helper JavaScript lengths remain 2,564
and 2,562 bytes but their hashes change. Both native addons retain their exact
2.1.114 bytes and hashes. The complete executable grows by 1,241,088 bytes;
the 2,989-byte difference from `.bun` growth is outside the embedded module
graph.

## Independent discovery tool

The discovery executable is pinned at 706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
The installed build references a Nix runtime, so the run used the cached glibc
2.42, source-highlight 3.1.9, Boost 1.89, ICU 76.1, and GCC 15.2 closures. It
was invoked from source-highlight's data directory so `lang.map` was visible.

Replay does not depend on trusting that tool: canonical outputs use only
authenticated executable byte slices. The independent parser separately read
the ELF section-name table, decoded the 56-byte footer and all directory
records, and verified every range and hash. The reusable direct-slice artifacts
and parser result from this run are under
`/tmp/claude-21116-artifacts/2.1.116-linux-x64`; the independent `dd` copies
are under `/tmp/claude-21116-direct-dd`.
