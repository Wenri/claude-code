# Reproduce the 2.1.88 source baseline

This fixed Linux x64 profile rebuilds the recovered 2.1.88 source tree, applies an explicit reconstruction/linking adapter, and replays a frozen binding-name recipe. The complete emitted JavaScript has 3,092,121 AST nodes and strict AST SHA-256 `10a774613d51c1500f70c70ce32a3a710b0edb0115d38568c87eeb8cc10f9117`.

The reference is the [pinned 2.1.88 mirror](https://raw.githubusercontent.com/Exhen/claude-code-2.1.88/c8cd253554319f32ff64ff7000636199f720c9bc/cli.js), SHA-256 `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f`. Authentication of the original removed npm artifact is still unavailable. All 13,046,737 executable bytes match this reference after excluding its recorded 306-byte shebang/comment banner and the emitted 45-byte debug-ID comment.

## Inputs and scope

- Source commit `6b8a3944745b3be1e147a8f7267e09da84e75d1e`, source tree `7640f58ea271eb60952ebdbe0dfa173fc96ebe30`.
- The checked input archive contains 6,067 files: 1,902 genesis source files plus the pinned dependencies, source assets, wrapper inputs and configuration needed by this reconstruction profile.
- The explicit SDK facades, unused-private-import contracts and SDK initialization convention are reconstructed inputs; they are not claims of authentic private source authorship.
- Reference-assisted preparation supplied the frozen identifier-name recipe. Emission accepts source inputs, profile, compiler, candidate and recipe; it does not accept a reference bundle or map. No generated application is executed.
- Exact names and definition order are retained in this result. The tool does not claim generic semantic equivalence after arbitrary renaming or reordering.
- Source-content identity does not establish generated source-map coordinate correctness. The finalizer map belongs to its actual pre-naming output; no renamed-output map is claimed.
- The filesystem input boundary is inspected and authenticated by the tools. OS-level isolation is not enforced; complete observed file-read tracing is unavailable.

## Reproduction

Use the exact pinned Node 24.19.0 Linux x64 executable and Bun 1.3.11 executable recorded in `manifest.json`; the driver rejects other bytes. Python 3 is used only for archive authentication/materialization. Run from the repository root with new output directories outside the repository.

The repository includes the complete source archive and the separate 181,638-byte `recovery/tooling/locked-node-dependencies.tar.gz` archive of the unchanged 46-file recovery parser/scope dependency closure. Verify the dependency archive SHA-256 `f2c24744ca5c9ae1c656d4883db5ccaaac277221891e1d49c4033ddde28e00db` before extracting its regular `node_modules/` members beneath `recovery/`. The driver rechecks every dependency file against the frozen tool pins. This route requires no package installation or lifecycle scripts.

Exact materialization and reproduction commands, the externally reviewed manifest hash, measured result and pinned tool identities are recorded alongside this document. Raw compiler output, original source map and receipts are preserved. Only the strictly authenticated trailing Bun metadata comment is canonicalized in the separate naming input so physical output paths cannot change the final replay hash.

This acceptance applies only to this 2.1.88 baseline. Later releases are validated incrementally from the previous verified source tree and receive their own input profiles and acceptance records. An existing historical patch or source-retention test is not a completed full-source release proof.

## Runtime acquisition pins

The existing Node executable was independently matched to the official [Node 24.19.0 release](https://nodejs.org/id/blog/release/v24.19.0):

- URL: `https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz`
- Archive: 31,633,904 bytes; SHA-256 `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
- Member `node-v24.19.0-linux-x64/bin/node`: 125,989,464 bytes; SHA-256 `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`

Bun is pinned to the official npm platform package:

- URL: `https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-1.3.11.tgz`
- Archive: 39,103,557 bytes; SHA-256 `c0b56af02a93fc18a373c0e82c21481a926ae85e1dcab3e446e41e0e7df91231`
- Executable: 99,295,408 bytes; SHA-256 `6d5bb405b1d037a2a466b92757de7e47e4369930fa94bd42f8ff44ba49de6c57`

Verify downloaded archives and executable members before use. These binaries are external prerequisites, not committed repository content. Runtime archive inspection did not run the recovered application or package lifecycle scripts.

Run the following after providing the verified runtimes and extracting the checked recovery dependency archive. Replace the three absolute paths with your new source/output directories and Bun executable. The output directory must not already exist. The Node command must resolve to the pinned executable above.

```sh
printf '%s  %s\n' \
  f2c24744ca5c9ae1c656d4883db5ccaaac277221891e1d49c4033ddde28e00db \
  recovery/tooling/locked-node-dependencies.tar.gz | sha256sum -c -
# For a clean checkout with no recovery/node_modules directory:
tar --keep-old-files -xzf recovery/tooling/locked-node-dependencies.tar.gz -C recovery

python3 recovery/scripts/materialize-baseline-inputs.py \
  --archive recovery/baselines/2.1.88/source-inputs.tar.gz \
  --manifest recovery/baselines/2.1.88/source-archive.json \
  --manifest-sha256 3604283475691894dc92b7704d4cac917cc3037907c7c17009bf6971780b2d90 \
  --output-root /absolute/new-source-inputs

env -u NODE_PATH -u NODE_OPTIONS -u BUN_OPTIONS node \
  recovery/scripts/reproduce-baseline.mjs \
  --manifest recovery/baselines/2.1.88/manifest.json \
  --manifest-sha256 4f6ee137529649f9381e3aa9e7001332eb811de6dde798227a35e905bdd268d6 \
  --input-root /absolute/new-source-inputs \
  --bun /absolute/pinned-bun-1.3.11 \
  --output-root /absolute/new-output
```

The driver runs one stage at a time. Its largest Node stage has a 6 GiB heap budget; allow additional operating-system and native-allocation headroom. Compilation, linking, comment-only metadata canonicalization, binding-name replay and the complete strict AST check each retain their own authenticated receipts. Intermediate stage-local conservative flags remain unchanged; the final acceptance record carries the completed result.
