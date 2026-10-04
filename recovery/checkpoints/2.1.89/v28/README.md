# 2.1.89 source-recovery checkpoint, revision 28

**Incomplete. Release 2.1.89 is not accepted.** The cumulative root `src/` remains at 2.1.126. This checkpoint does not advance any later release.

The source-only build and strict whole-Program parse pass. The candidate has 3,097,309 nodes and digest `296db1eb2fc7664c78df16942384075205adfc3a95e73c1a408969573a867e08`. The official target has 3,098,331 nodes and digest `1bf84c8d2685868f68f2d050847b463aa79386f1ffe2dde5cd0cc62cf9c0bb9c`. They are unequal. Node counts are not distances or completion percentages. Neither strict equality nor conservative whole-program behavioral acceptance has been established.

## Included source and results

- 156 changed/new source files relative to the committed, verified 2.1.88 archive, with readable copies and a matching pinned overlay archive. The resulting tree has 6,084 files and 50,939,997 bytes. No baseline file is deleted and dependency bytes stay exact.
- Reviewed compiler/finalizer inputs, public profile, exact toolchain and strict checker. Existing pinned parser dependencies and baseline inputs are reused. No compiler executable or target application bundle is committed.
- Locator-redacted review reports that preserve every result and limitation. Their original hashes identify the private immutable originals; they are not hashes of these redacted derivatives.

The reviewed source and actual-emission results now include the V25 snapshot/viewport repairs, V26 main calls and message lookups, and V27 Bash/pipe, CrossProjectResume and Pane function/direct-order repairs. V28's complete YAML owner and real lazy fallback graph pass. Its autoCompact module now has the target timing/feature/refill/header behavior, two references to the same state initializer, full 67-node initialization and main slot 17. All twelve agent-file functions, the cache-once tools value, baseDir/evaluation order, native bindings and real 28-node initializer pass their scoped checks.

The broader Bash dependency graph retains an inherited Windows provider-order failure. AgentEditor and the markdown parser still have separate body gaps. Message-rating grouping and wrapper topology, additional source/body/cache differences, conditional external interfaces, source-map coordinates and whole-program equivalence remain unresolved. Five follow-on source owners for file-read guards, AgentEditor and Windows ordering are recorded in STATUS.json; their proposals are excluded from these V28 inputs and still need new actual checks.

Consistent binding renames and provably independent definition ordering can qualify through conservative whole-program evidence; strict equality is the stronger diagnostic. Neither route has passed. The original agent-file report's stricter sentence is preserved alongside evidence/agent-file-acceptance-clarification.json. That clarification changes no proof, false whole-program result or gate. Read each report's scope before relying on it.

## Reproduce without the private work directory

Provide the exact Node 24.19.0 and Bun 1.3.11 Linux x64 executables pinned in `runtime-provenance.json`; verify the official archive and member hashes there. No runtime binary is committed. Use a fresh output directory and one heavy process. The materializer performs no downloads, package lifecycle scripts or application execution.

From the repository root, first verify this commit and the manifest checksum:

```sh
CHECKPOINT=recovery/checkpoints/2.1.89/v28
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
  --expected-profile-sha256 2086c76130988902f6515c2710c3a0005b49bb8aea8459cde8c454f2a41ed4c3 \
  --toolchain "$WORK/recovery/profiles/2.1.89/toolchain.json" \
  --expected-toolchain-sha256 efb7c535d4c456e848db8a2b5d8b08d8fcc20a38f03dd1206e306c7d787d1a35 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output
```

Repeat with `--compile` instead of `--preflight`. Clear `NODE_PATH`, `NODE_OPTIONS` and `BUN_OPTIONS` before these commands. Hash the newly produced `compile-report.json`; never substitute a historical report hash. Run the finalizer with the same profile/toolchain/input/output arguments and `--expected-compile-report-sha256 NEW_REPORT_SHA256`:

```sh
REPORT_SHA="$(sha256sum /absolute/new-build-output/compile-report.json | cut -d ' ' -f 1)"
"$NODE" --max-old-space-size=384 "$WORK/recovery/scripts/finalize-2.1.89-candidate.mjs" \
  --finalize --profile "$WORK/recovery/profiles/2.1.89/profile.json" \
  --expected-profile-sha256 2086c76130988902f6515c2710c3a0005b49bb8aea8459cde8c454f2a41ed4c3 \
  --toolchain "$WORK/recovery/profiles/2.1.89/toolchain.json" \
  --expected-toolchain-sha256 efb7c535d4c456e848db8a2b5d8b08d8fcc20a38f03dd1206e306c7d787d1a35 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output \
  --expected-compile-report-sha256 "$REPORT_SHA"
"$NODE" --max-old-space-size=3072 "$WORK/validation/scripts/strict-ast-digest.mjs" /absolute/new-build-output/final/cli.js
```

The expected candidate AST is recorded above; equality to that checkpoint result does not establish equality to the official target. Compilation accepts reconstructed source and pinned build inputs, not a target bundle or source map as an output substitute. Never execute the resulting application, extracted functions, hooks, shell commands or authentication operations as part of this workflow.

## Publication and evidence limits

`profile-publication.json` lists each historical locator-string redaction. Source bytes, guard/eval records, build options, compiler/finalizer code and toolchain remain unchanged. The public profile intentionally has a different hash. A fresh isolated materialization and relocated build/finalizer/strict-check replay passed, reproducing the exact recorded candidate AST. The result is in `evidence/public-relocated-replay.json`; it does not establish equality to the official target.

No credentials, cookies, private Library identifiers, raw private command logs, runtime binaries, full generated application bundle or large AST inventory are included. Original private authorship, universal TypeScript/API compatibility and arbitrary reflection/dynamic/ambient equivalence are not established. Historical failures remain unchanged. Compile/parse/hash only: never execute the recovered application, extracted functions, hooks, shell/completion commands or authentication operations as part of this workflow.
