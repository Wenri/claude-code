# 2.1.90 source-recovery checkpoint, trial 7

**Incomplete: release 2.1.90 is not accepted.** The cumulative repository root `src/` remains at 2.1.126. This checkpoint is isolated under `recovery/checkpoints/2.1.90/trial7` and does not advance the root source version.

The reviewed private source-only build and strict whole-program parse passed. Candidate AST: 3,105,172 nodes, digest `5dcf01b84a95cde1a3c1faacce353265a6e6104d991273b628c65611c8843839`. Official target: 3,110,206 nodes, digest `c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7`. They differ. Counts are not distances or completion percentages. Sound binding-aware alpha-equivalence and provably independent ordering remain permitted only where actually established; neither whole-version route has passed.

## Files and bounded results

The overlay contains 205 changed/new compiler inputs, 7,330,393 uncompressed bytes, over the existing pinned 2.1.88 archive. It includes 180 source files and 25 vendor files; no baseline file is removed. Materialization yields 6,108 inputs / 51,036,694 bytes, with 1,958 staged `src` files, 1,929 Git source rows and 29 assets. The full source manifest is `966823ecc70d3a6009ee3c2100516666941222168e877c9408dcbaf502ec6e29`; the derived source tree is `7db5611b82602d46d5ce983904e0a573e1b74402`.

Trial 7's complete AWS sharing graph now includes the three consumers, shared 995-node handler, distinct base64/protocol factories, retained 1,191-node root handler and both root consumers. The query-string wrapper's relative top-level placement still differs; global first-initialization order and deeper SDK behavior remain unresolved. Command registration now places the same toggle-memory value after mobile and before model. The prior contradictory registration evidence and rejected two-route AWS plans remain historical failures.

The carried env/Markdown fixes and prior components have separate scoped reports. Bootstrap state, adjacent JSON parser, deeper suppliers, raw Powerup grouping, session-storage metadata/resume and broader inherited source/body/cache/ordering differences remain open. See `STATUS.json` and each included report's limits. No report establishes universal TypeScript/API compatibility, source-map correctness, original private-source authorship, arbitrary reflection/dynamic/ambient equivalence or whole release acceptance.

## Offline materialization

This reuses the committed `.88` source archive and locked parser dependency archive. No full target/candidate bundle, source map, compiler executable or new installed dependency is included. The 23 non-dependency runtime files plus the existing 46 parser files reconstruct the exact 69-file runtime; the separate strict checker has 48 files.

From the repository root, verify this commit and the manifest checksum:

```sh
CHECKPOINT=recovery/checkpoints/2.1.90/trial7
(cd "$CHECKPOINT" && sha256sum -c manifest.sha256)
python3 -I -B "$CHECKPOINT/materialize.py" \
  --repo-root "$PWD" \
  --manifest "$PWD/$CHECKPOINT/manifest.json" \
  --manifest-sha256 "$(cut -d ' ' -f 1 "$CHECKPOINT/manifest.sha256")" \
  --output-root /absolute/new-checkpoint-work
```

The materializer requires an external manifest digest and a fresh absolute output path outside the repository. It authenticates all archive/file bytes before writing, rejects unexpected/missing/symlink/special/traversal/duplicate members, and runs no package scripts or application code. Inputs and the output parent must be quiescent. An I/O failure can leave a partial new output, which must not be silently reused.

## Reproduce the compiler result

Use the exact Node 24.19.0 and Bun 1.3.11 Linux x64 binaries described by official URLs and archive/member hashes in `runtime-provenance.json`. No executable is supplied. Authenticate both before use. Set `WORK` to the materialized directory and `NODE`/`BUN` to those authenticated executables. Clear `NODE_PATH`, `NODE_OPTIONS` and `BUN_OPTIONS`. Run one process at a time.

The runtime filenames retain `2.1.89` as reused implementation locations. Their reviewed fixed admission accepts the exact `.90` profile; filenames are not the current target version.

```sh
"$BUN" --no-env-file --no-install "$WORK/recovery/scripts/build-2.1.89-candidate.mjs" \
  --preflight --profile "$WORK/recovery/profiles/2.1.90/profile.json" \
  --expected-profile-sha256 09e70cb95ae3fc71cdb539f0bea0a9a6c24223c696970deb4ea3d69072e92977 \
  --toolchain "$WORK/recovery/profiles/2.1.90/toolchain.json" \
  --expected-toolchain-sha256 886f71b1c19b4e9c957934c457f221472d45afa0e89424f9eff7bf217e5299a5 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output
```

Repeat with `--compile` in place of `--preflight`. Hash the newly produced `compile-report.json`; never use a historical report hash for a new run. Then:

```sh
REPORT_SHA="$(sha256sum /absolute/new-build-output/compile-report.json | cut -d ' ' -f 1)"
"$NODE" --max-old-space-size=384 "$WORK/recovery/scripts/finalize-2.1.89-candidate.mjs" \
  --finalize --profile "$WORK/recovery/profiles/2.1.90/profile.json" \
  --expected-profile-sha256 09e70cb95ae3fc71cdb539f0bea0a9a6c24223c696970deb4ea3d69072e92977 \
  --toolchain "$WORK/recovery/profiles/2.1.90/toolchain.json" \
  --expected-toolchain-sha256 886f71b1c19b4e9c957934c457f221472d45afa0e89424f9eff7bf217e5299a5 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output \
  --expected-compile-report-sha256 "$REPORT_SHA"
"$NODE" --max-old-space-size=3072 "$WORK/validation/scripts/strict-ast-digest.mjs" /absolute/new-build-output/final/cli.js
```

A fresh relocated public replay passed materialization, preflight, compile, finalization and strict parsing. It reproduced the exact recorded candidate AST. Its final JavaScript differs only in the final debugId comment; every preceding byte is identical. No source-map coordinate or byte equality is claimed. See `evidence/public-relocated-result.json` and `evidence/public-relocated-byte-comparison.json`. This reproduces the checkpoint, not equality to the official target. The replay used the preserved initial core manifest `de6aea5d1a0ab1e6d46c8721b8e2848f00cb2503467f62d1f2549bf1a261352a`; this supplemental manifest changes only documentation/status/evidence, with identical source/profile/runtime/materializer/overlay inputs. Never execute the recovered application or extracted callbacks as part of verification.

## Provenance and publication limits

`provenance/official-cli/registry.json` gives the official `.90` tarball URL and registry integrity. `provenance/packages.json` pins the downloaded archive and official target JS digest. The official LICENSE.md, README.md and package.json remain together; the package's license field refers to its README. Vendor license/metadata files retain their original terms. These materials do not relicense recovered files or claim authentic private-source authorship.

AWS compiler inputs use the previously reviewed 16-file ESM subset. The new auth routing literal is reconstructed and differs from the signed original. Existing package metadata may advertise omitted CJS/types/subpaths; those are not a supported standalone package surface. Sandbox runtime inputs use the reviewed reachable library subset, with exact attribution retained. Full official archives remain provenance references, not unnecessary compiler payload.

`profile-publication.json` and `evidence/publication-reports.json` record every locator redaction by JSON pointer, original string digest and published replacement. Source bytes, all guard/eval records, options, runtime code and toolchain are unchanged. Historical locator labels do not promise bundled private proof files; the complete private proof archive is intentionally excluded. No credential/auth-directory, raw cookie, private Library locator, runtime binary, full generated application bundle or large AST inventory belongs in this payload.
