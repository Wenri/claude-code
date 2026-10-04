# 2.1.89 source-recovery checkpoint, revision 22

**Incomplete. This is a reviewed work checkpoint, not acceptance of release 2.1.89.** The cumulative root `src/` remains at 2.1.126. No later release is advanced by this commit.

The recovered tree builds and passes a strict whole-Program parse. Its AST has 3,098,404 nodes and digest `b099c01d6f39b99efb39fa5f61c2ce126f9bf3b9bed181d2df7b3ae96edac590`. The official target has 3,098,331 nodes and digest `1bf84c8d2685868f68f2d050847b463aa79386f1ffe2dde5cd0cc62cf9c0bb9c`. They are unequal. Counts are not edit distances, and consistent local renames or reordered definitions require a separate conservative proof; no whole-program behavioral acceptance is claimed.

## What is included

- 148 changed/new source files relative to the committed, verified 2.1.88 input archive. Readable copies are under `source-overlay/`; the identical pinned archive is used by the materializer. The complete resulting tree has 6,084 files and 50,950,550 bytes. No baseline file is deleted and no dependency runtime bytes change.
- The reviewed compiler/finalizer runtime, public profile, exact toolchain and strict AST checker. Existing pinned parser/scope dependencies and unchanged baseline inputs are reused, rather than duplicating installations or executable binaries.
- Path-redacted source/preparation/actual-review reports and explicit successful, failed and pending scopes. These are public derivatives of the recorded immutable reports, not claims that redacted bytes retain the original hashes.
- A reviewed future `spawnUtils` proposal under `pending/`. It is not applied to the active source tree. Unreviewed SpawnMultiAgent and SearchBox proposals are identified in `STATUS.json` but not included in active inputs.

Revision 21's REPL import placement and message-rating provider/cache checks pass within their stated scopes. Revision 22's two shell source changes and preparation have independent approval, and all five serial build/check steps pass. **The fresh production shell initializer, shared-helper binding and other-consumer retention reviews remain pending.** Message-rating assignment grouping, wrapper/provider topology, other source gaps, generated source-map coordinates, and whole-program equivalence remain unresolved. Read `STATUS.json` and individual reports before relying on a partial result.

## Reproduce without the private work directory

Provide the exact Node 24.19.0 and Bun 1.3.11 Linux x64 executables pinned in `runtime-provenance.json`; verify the official archive and member hashes there. No runtime binary is committed. Use a fresh output directory and one heavy process. The materializer performs no downloads, package lifecycle scripts or application execution.

From the repository root, first verify this commit and the manifest checksum:

```sh
CHECKPOINT=recovery/checkpoints/2.1.89/v22
(cd "$CHECKPOINT" && sha256sum -c manifest.sha256)
python3 -I -B "$CHECKPOINT/materialize.py" \
  --repo-root "$PWD" \
  --manifest "$PWD/$CHECKPOINT/manifest.json" \
  --manifest-sha256 "$(cut -d ' ' -f 1 "$CHECKPOINT/manifest.sha256")" \
  --output-root /absolute/new-checkpoint-work
```

The output contains `inputs/`, `recovery/` and `validation/`. Set `WORK` to that new directory and `BUN`/`NODE` to the authenticated executable paths. Read the exact public profile and toolchain digests from `manifest.json`'s `files` entries. Then run serially:

```sh
"$BUN" --no-env-file --no-install "$WORK/recovery/scripts/build-2.1.89-candidate.mjs" \
  --preflight --profile "$WORK/recovery/profiles/2.1.89/profile.json" \
  --expected-profile-sha256 7e4126e11cfb1a7507c1c106926f1521d414023bb04aad76151fae04d8b2ba1e \
  --toolchain "$WORK/recovery/profiles/2.1.89/toolchain.json" \
  --expected-toolchain-sha256 069ec7d84b9c5088f78cd66bc80d335ac4ab00042de2a9d8b9134415002880f7 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output
```

Repeat with `--compile` instead of `--preflight`. Clear `NODE_PATH`, `NODE_OPTIONS` and `BUN_OPTIONS` before these commands. Hash the newly produced `compile-report.json`; never substitute a historical report hash. Run the finalizer with the same profile/toolchain/input/output arguments and `--expected-compile-report-sha256 NEW_REPORT_SHA256`:

```sh
REPORT_SHA="$(sha256sum /absolute/new-build-output/compile-report.json | cut -d ' ' -f 1)"
"$NODE" --max-old-space-size=384 "$WORK/recovery/scripts/finalize-2.1.89-candidate.mjs" \
  --finalize --profile "$WORK/recovery/profiles/2.1.89/profile.json" \
  --expected-profile-sha256 7e4126e11cfb1a7507c1c106926f1521d414023bb04aad76151fae04d8b2ba1e \
  --toolchain "$WORK/recovery/profiles/2.1.89/toolchain.json" \
  --expected-toolchain-sha256 069ec7d84b9c5088f78cd66bc80d335ac4ab00042de2a9d8b9134415002880f7 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output \
  --expected-compile-report-sha256 "$REPORT_SHA"
"$NODE" --max-old-space-size=3072 "$WORK/validation/scripts/strict-ast-digest.mjs" /absolute/new-build-output/final/cli.js
```

The expected candidate AST is recorded above; equality to that checkpoint result does not establish equality to the official target. Compilation accepts reconstructed source and pinned build inputs, not a target bundle or source map as an output substitute. Never execute the resulting application, extracted functions, hooks, shell commands or authentication operations as part of this workflow.

## Publication and evidence limits

`profile-publication.json` lists each historical locator-string redaction. The source lists, source bytes, guard/eval records, build options, compiler/finalizer code and toolchain remain unchanged. Public profile bytes intentionally have a new hash. A fresh isolated materialization and relocated compiler/finalizer/strict-check replay passed for that public derivative, reproducing exactly the same candidate AST. The result is recorded in `evidence/public-relocated-replay.json`.

No credentials, private Library identifiers, raw private command logs, runtime binaries, full generated application bundle or large AST inventory are included. Original private source authorship, universal TypeScript/API compatibility and arbitrary reflection/dynamic/ambient equivalence are not established. Historical failures are retained; the pending directory grants no blanket permission to apply or accept its proposal.
