# 2.1.90 source-recovery checkpoint, Trial15

**Incomplete: release 2.1.90 is not accepted.** This checkpoint is isolated under recovery/checkpoints/2.1.90/trial15. The cumulative repository root remains version 2.1.126, source tree 03356a5a73253994e1842638230aa9043e2d6efa. Earlier checkpoints, commits and tags are unchanged.

The exact private source-only trial and strict parse passed. Candidate AST: 3,106,137 nodes, digest `e515117b9569651a7ae6350a0d9662c9f3292041321be73f61225a1e8ea25e09`. Official target: 3,110,206 nodes, digest `c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7`. They differ. Counts are neither distances nor completion percentages. Whole-version binding equivalence and global initialization acceptance remain false.

## Current files and bounded results

The exact overlay contains 211 changed/new inputs / 7,490,837 uncompressed bytes (186 src files and 25 vendor files), over the already committed 2.1.88 baseline. No baseline input is deleted. Materialization yields 6,109 inputs /51,044,467 bytes: 1,959 staged src files, 1,930 Git source rows and 29 assets. Source manifest: `7f11c207fc446269b90193049e68a9d3aa8fa3e8f52ebd8a26a4987942dc38c4`; derived src tree: `3bdf74a6aacabb01ed05f562f3e27ffe4bd7bc9d`.

Trial15's permission Project/cache/write/reader graph and real effect pass scoped checks. Its overall receipt remains false because inherited sessionIngress 47/44, full REPL 15429/15410 and prefix 688/685 boundaries remain. The 296-node rating provider passes exact ref/updater/analytics/notification checks; raw 75/71 initializer, extra hook and REPL topology remain separate. See STATUS.json and the complete locator-redacted actual receipts. Older mixed/failing results retain their original statuses and chronology; later scoped results do not rewrite them.

## Offline materialization

The committed baseline and locked parser archive are required. No full target/generated bundle, generated map, compiler executable or new dependency install is included. Exact runtime reconstruction has 69 files; strict-checker/parser reconstruction has 48 files. Authenticate the public commit and external manifest digest first.

```sh
CHECKPOINT=recovery/checkpoints/2.1.90/trial15
(cd "$CHECKPOINT" && sha256sum -c manifest.sha256)
python3 -I -B "$CHECKPOINT/materialize.py" \
  --repo-root "$PWD" \
  --manifest "$PWD/$CHECKPOINT/manifest.json" \
  --manifest-sha256 "$(cut -d ' ' -f 1 "$CHECKPOINT/manifest.sha256")" \
  --output-root /absolute/new-checkpoint-work
```

The reviewed data-only helper authenticates all files/archive members before writing. It rejects missing/extra, symlink/special, traversal/duplicate members and existing, overlapping or repository output paths. Inputs/output parent must be quiescent. An I/O failure may leave a partial new output, which must not be silently reused. Only fixed revision/path/inventory literals changed from the audited Trial7 helper; all algorithms and safety policies are exact.

## Reproduce the compiler result

Use authenticated Node 24.19.0 and Bun 1.3.11 Linux x64 from runtime-provenance.json; no executable is supplied. Set WORK to the materialized directory and NODE/BUN to those verified binaries. Clear NODE_PATH, NODE_OPTIONS and BUN_OPTIONS. Run one process at a time. The retained 2.1.89 runtime filenames are implementation paths, not the current target version.

```sh
"$BUN" --no-env-file --no-install "$WORK/recovery/scripts/build-2.1.89-candidate.mjs" \
  --preflight --profile "$WORK/recovery/profiles/2.1.90/profile.json" \
  --expected-profile-sha256 ef82cd19baf9bd2520b7bda4a944d57c6fa0674acfc44536f93a4ec1775083c9 \
  --toolchain "$WORK/recovery/profiles/2.1.90/toolchain.json" \
  --expected-toolchain-sha256 c55222452c78ccde4ea41c3bde1ee1eebd0095f7096af51941d444cb4802c3f9 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output
```

Repeat with --compile in place of --preflight. Hash that run's new compile-report.json, then:

```sh
REPORT_SHA="$(sha256sum /absolute/new-build-output/compile-report.json | cut -d ' ' -f 1)"
"$NODE" --max-old-space-size=384 "$WORK/recovery/scripts/finalize-2.1.89-candidate.mjs" \
  --finalize --profile "$WORK/recovery/profiles/2.1.90/profile.json" \
  --expected-profile-sha256 ef82cd19baf9bd2520b7bda4a944d57c6fa0674acfc44536f93a4ec1775083c9 \
  --toolchain "$WORK/recovery/profiles/2.1.90/toolchain.json" \
  --expected-toolchain-sha256 c55222452c78ccde4ea41c3bde1ee1eebd0095f7096af51941d444cb4802c3f9 \
  --input-root "$WORK/inputs" --output-root /absolute/new-build-output \
  --expected-compile-report-sha256 "$REPORT_SHA"
"$NODE" --max-old-space-size=3072 "$WORK/validation/scripts/strict-ast-digest.mjs" /absolute/new-build-output/final/cli.js
```

The fresh relocated Trial15 compiler replay passed preflight, compilation, finalization and strict parsing. It reproduces the reviewed candidate strict AST exactly (3,106,137 nodes; e515117b9569651a7ae6350a0d9662c9f3292041321be73f61225a1e8ea25e09). The result is recorded in evidence/portable-trial15-replay.json. Offline materialization/file audit are distinct from compiler replay. The included historical Trial7 replay applies only to Trial7. Reproducing the recorded candidate AST would not establish equality with the official target. Never execute the recovered application or callbacks as part of these checks.

## Provenance and limits

Official CLI LICENSE.md, README.md, package.json and registry integrity remain together under provenance/. Exact sandbox/AWS license and package metadata are retained. These documents do not relicense files or prove original private-source authorship. AWS inputs use the reviewed 16-file ESM subset and explicitly reconstructed routing; omitted CJS/types/subpaths are not supported standalone APIs. The reachable sandbox subset has its original attribution.

profile-publication.json and evidence/publication-reports.json journal locator-only changes by JSON pointer, original string digest and published replacement. Exact source/runtime bytes, guard/eval records, options and numeric/boolean statuses are preserved. Historical locator labels are not reproduction prerequisites or claims that private proof archives are included. Source maps, arbitrary reflection/dynamic/host equivalence, full storage/REPL/permission behavior and whole-version acceptance remain unproved. No credential/auth directory, raw cookies, private Library locator or native executable belongs in this payload.
