# Claude Code 2.1.89: accepted fixed-profile V45 source checkpoint

This checkpoint rebuilds the complete official 2.1.89 AST from the recovered source tree. The fresh public-layout build matches **3,098,331 AST nodes and all 18,181 ordered statements**, under the unchanged `strict-whole-program-ast-v2` criterion (Acorn 8.15.0, ECMAScript 2026):

`1bf84c8d2685868f68f2d050847b463aa79386f1ffe2dde5cd0cc62cf9c0bb9c`

The 13,080,759-byte executable body also matches the authenticated official body exactly. The official 306-byte banner is absent; Bun adds a 45-byte trailing debugId comment. Whole-file byte reproducibility is **not** claimed: debugId metadata can differ. No recovered application, hook, function or emitted output was executed.

## Scope and lineage

- 6,087 source inputs, 50,891,990 source bytes; 1,954 files under `src/`, of which 1,923 are Git source pins and 31 are extra source assets.
- Source manifest: `b1a948e024d437956a502ea5069376c366c38c21a8586a41ff99d91fd2649996`.
- Derived `src` tree: `6e8126a8f8619316d072c58cb10788683d1ad74e`.
- Exactly 205 changed/new inputs relative to the checked-in 2.1.88 source archive. Both readable [source-overlay/](./source-overlay/) files and the bounded overlay archive contain the same bytes. Three changed inputs are vendored lodash files; dependencies are not all unchanged.
- The accepted materialized stage has 6,165 files, including 76 pinned recovery tool/data files. Nineteen validation files live separately alongside it.
- The profile, toolchain, source contract, compiler, finalizer, exact-name recipe, namer, independent AST inspector and map oracle are byte-identical to their reviewed inputs.

The identifier recipe contains binding-role/name metadata, not replacement program bodies. It was prepared against the reference during offline review. The build phases use only the pinned recovered inputs; the official comparison index is decoded separately after emission. This is a reviewed path/pin boundary, not kernel-level read isolation.

This checkpoint is additive. The cumulative root `src/` remains at 2.1.126; older .89 checkpoints, .90 work and release-case history are unchanged. Old failure/acceptance flags remain historical evidence; [STATUS.json](./STATUS.json) records this checkpoint's effective technical result.

## Reproduce without running the recovered application

Use Linux x64, Python 3.12, and the exact Node 24.19.0 / Bun 1.3.11 binaries in [runtime-provenance.json](./runtime-provenance.json). That file records official download URLs and archive/binary hashes. Supply canonical regular binary paths; symlinks, mismatched binaries, package installation and lifecycle hooks are not accepted.

Use a clean checkout containing the shared files:

- `recovery/baselines/2.1.88/source-archive.json`
- `recovery/baselines/2.1.88/source-inputs.tar.gz`
- `recovery/tooling/locked-node-dependencies.tar.gz`

Their exact sizes/hashes are bound by the immutable materialization manifest. No private archive service or prior local stage is needed. Keep at least 600 MiB free before the build; more space is needed for the complete working tree and retained verification outputs. The driver rejects sampled child RSS at 3 GB and a phase lasting over 600 seconds. These are observed bounds, not hard OS isolation.

Set `REPO` to the absolute checkout root, `WORK` to a new absolute directory outside the checkout, `VERIFY` to another new absolute directory outside both, and `NODE` / `BUN` to the exact binaries. Their parent directories must already exist. The following commands materialize data, compile, finalize, emit identifiers and inspect AST/maps; they never start the emitted CLI.

```sh
CP="$REPO/recovery/checkpoints/2.1.89/v45"
MANIFEST_SHA=4c15f8e7860070197a4188689ab026897d8945c21c98114935fa5a61bcb946dd
python -B "$CP/test-materialize.py"
python -B "$CP/materialize.py" --repo-root "$REPO" --manifest "$CP/manifest.json" --manifest-sha256 "$MANIFEST_SHA" --output-root "$WORK"
python -B "$CP/run.py" --repo-root "$REPO" --manifest-sha256 "$MANIFEST_SHA" --stage-root "$WORK/v45-source-batch" --output-root "$WORK/source-batch-v45-diagnostic" --node "$NODE" --bun "$BUN"
python -B "$CP/validation/verify-public-output.py" --repo-root "$REPO" --manifest-sha256 "$MANIFEST_SHA" --work-root "$WORK" --node "$NODE" --output-root "$VERIFY"
```

The sibling directory names and raw/final/named relationships are fixed. The successful replay used a WORK path with exactly four components beneath `/`, outside `/home`. For example, `/tmp/claude-repro/work/v45` preserves that tested shape; its parent `/tmp/claude-repro/work` must already exist, and `v45` must not. This retains the six `../` components before the four fixed `/home/runner` virtual source identities. A WORK path under `/home` can share a prefix with those identities and change the map strings. Arbitrary-depth or arbitrary-layout portability is not established. If source-path strings or map commitments differ, the verifier fails rather than rewriting outputs or weakening acceptance.

The immutable [manifest.json](./manifest.json) pins all build, validation, comparison and historical-evidence input files. It deliberately excludes late replay results and documentation. [publication-inventory.json](./publication-inventory.json) separately pins the final files, preventing a replay-result/manifest hash cycle. Verify its checksum and the materialization manifest before use. Python `-B` prevents incidental bytecode-cache writes; start with no pre-existing generated cache files in the checkpoint.

## Validation performed

- Safe baseline/overlay/dependency materialization, all 6,165 stage pins and 19 independent-validation file pins; 53 packaged materializer control groups.
- Four serial phases using exact pinned Node/Bun and unchanged compiler/finalizer/namer/inspector bytes.
- Complete official strict AST and every ordered statement, with the expected uniform -306 UTF-16 range displacement.
- All 57,783 recipe binding roles and 217,569 physical identifier edits; full in-memory reconstruction of named UTF-16 and UTF-8 bytes.
- Every source-map mapping/GLB boundary and all 4,771 embedded source identities: 4,767 physical staged sources and four explicitly declared virtual historical identities. Historical absolute paths are not read.
- Exact executable-core commitment and all saved map fields except debugId; no generated output was normalized or edited.

The prior private saved-source replay and this public-layout replay are distinct evidence. [evidence/publication-reports.json](./evidence/publication-reports.json) records the exact provenance-only omissions in public historical report copies; original hashes are not misrepresented as hashes of edited bytes.

## Limits

Acceptance is for this fixed recovered profile and official artifact. It does not establish original TypeScript authorship, erased names/comments/types, alternative feature profiles, runtime/native/ambient behavior, arbitrary relocation, or repaired upstream source-map displacement. Map validation establishes the documented same-line GLB composition and source identities, not every external debugger consumer. Conserving debugId does not establish its uniqueness or external association.
