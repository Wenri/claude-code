# Exact recovery payloads

The implementation and npm wrapper are recovered as separate layers because
2.1.113 changes the package topology.

## Embedded source graph

| Target | Algorithm | Payload bytes | Payload SHA-256 |
| --- | --- | ---: | --- |
| `src/entrypoints/cli.js` | Zstandard dictionary patch from 2.1.112 `cli.js` | 3,006,851 | `11c55b5f…65f98a` |
| `image-processor.js` | Zstandard | 1,322 | `9daa5bf2…981b` |
| `audio-capture.js` | Zstandard | 1,318 | `6468ea6b…8d572` |

Replaying these three payloads produces every plain JavaScript source entry in
the authenticated Bun directory: 12,991,968 bytes in total, framed-tree
SHA-256
`9272fcbb565dac0fd95b1d0ac3924dc8708b0173cbf4564b228d7a1225209a6a`.

The 113,376,768-byte JSC cache and two native addons are authenticated and
range-verified from the native package. They are generated/native artifacts,
not additional missing authored JavaScript.

## Thin npm wrapper

The exact 2.1.113 wrapper tree is reconstructed from the 2.1.112 wrapper tree
with these payloads:

| Member | Recovery | Payload bytes |
| --- | --- | ---: |
| `package/package.json` | dictionary patch | 139 |
| `package/bin/claude.exe` | Zstandard | 278 |
| `package/cli-wrapper.cjs` | Zstandard | 1,656 |
| `package/install.cjs` | Zstandard | 2,427 |

Three members are reused byte-for-byte and sixteen obsolete members,
including the old published `package/cli.js`, are removed. Reconstruction is
checked against every path, mode, member hash, and the target framed-tree hash
`7333b8898ec3e7ef6a624848581b4ca22dbca42e2036b3c2519f688a74d21721`.

