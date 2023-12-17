# 2.1.96 → 2.1.97 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.97 from the verified 2.1.96 base.

The result has two explicit confidence levels:

1. The published 2.1.97 bundle, declarations, and npm package tree are
   recovered exactly.
2. Authored TypeScript is recovered only where the generated target provides
   sufficient placement evidence. Erased spelling and module boundaries are
   not invented.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.96-to-2.1.97
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the adjacent published release

Resolve exact versions, never a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.96 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.97 version dist --json
```

Confirm that no published version falls between them. Pin the official
`v2.1.97` tag and changelog at commit
`22fdf68049e8c24e5a36087bb742857d3d5e407d`.

```text
2.1.96 tarball bytes  18,527,078
sha256                 46d70278ea9ac6a8f9c0b772a562c7b90be00a11caa9ba006bc99fbc3a88de58

2.1.97 tarball bytes  18,546,637
sha256                 59df8e883edd0925bcb73407f974d0138c39106b744b8e6453ff23e3154b9a8a
published               2026-04-08T21:27:55.556Z
```

Download and hash-check every manifest input:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

The acquisition step also extracts and verifies the archive members used by
later commands.

## 2. Authenticate and compare every package member

Run the exhaustive tar comparison with pinned registry metadata:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.96/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.96 \
  --target-version 2.1.97 \
  --baseline-shasum d528e9638292c7b275c896b283e4a8e6959ef0ef \
  --target-shasum b790d417b4f47b897068ffff9b57812ccc81e707 \
  --baseline-integrity \
    'sha512-ETrc0+1qWHaqtKi+ixbsAecZyM+H52VIJj+zWIvw3jBU/JZ9v5vnE2kHShM1lcpr+Gji7GXk23l0CMGLA7hC0g==' \
  --target-integrity \
    'sha512-8lKM/rFctBl+82bQ+0g0Lkbt9tJU/zYKAjWisNUq436/386n/VZQbnyjnibGkyqqB6mrX/3ub/cpFlpCu4FXLg==' \
  --baseline-signature \
    'MEUCIDfVFVFY0qtDRV8JGrx0/QKyh70/hWuV+lO0LSTt2zz6AiEA20JmCcoQACXgZOSLdrLxZ8I2356j3KvBbianSlhxu0A=' \
  --target-signature \
    'MEUCICG6rML8JBFMxvrHFFDhofBztC5mvsOLqHbO7G4bdU4MAiEA/TuR+/HzSBvE2e/5XokcLHWOLaw604eahZ4Hy+IFTew=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.96.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.97.tgz'
```

Require:

```text
20 baseline members
20 target members
17 unchanged
3 changed
0 added
0 removed
0 mode-only changes
complete = true
```

The complete changed set must be `package/cli.js`, `package/package.json`,
and `package/sdk-tools.d.ts`. Both signatures must verify under the pinned
registry key.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.96 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

```text
source-oracle bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
source-oracle map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never apply the 2.1.88 map directly to 2.1.96 or 2.1.97 offsets.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988
```

The builder reconstructs and byte-compares the target before succeeding.

```text
delta bytes   2,389,730
delta sha256  98f02e8e2ab14afc0e2d68db5939072b5ef363b8adb7b6a087deb2a5d8a3a57c
```

## 5. Recover public declarations with ordered exact edits

Diff the adjacent declaration members directly:

```sh
diff -u \
  "$RECOVERY_ARTIFACTS/2.1.96/package/sdk-tools.d.ts" \
  "$RECOVERY_ARTIFACTS/2.1.97/package/sdk-tools.d.ts"
```

Encode each observable change in
`targetAssertions.declarationExactEdits`:

- `{anchor, text}` inserts the optional `toolStats` object; and
- `{from, to}` changes `originalFile` to `string | null`.

The shared exact-edit helper must reject:

- a missing or duplicate match;
- edits listed out of baseline order;
- overlapping matches;
- ambiguous edit shapes; and
- no-op edits.

It must replay both changes and compare the complete 117,378-byte result
against target SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.

Build the redundant declaration delta as an independent cross-check:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.96/package/sdk-tools.d.ts" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package/sdk-tools.d.ts" \
  --output "$RECOVERY_WORK/sdk-tools.d.ts.zstd-delta" \
  --expected-baseline-sha256 \
    d54800cb26dbfc3e15d0ab034ef9c77e340fb7ec76270a167f39245f7155c4b4 \
  --expected-target-sha256 \
    9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe
```

The resulting cross-check is 113 bytes with SHA-256
`83e00e75ff62a2436e54e3dd0ba7f5e90fcfca59bd3a012eeca2fe91e9efde54`.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.97/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.97/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-22fdf680.md" \
  --changelog-section 2.1.97
```

Require:

- 4,756 baseline source rows;
- 4,576 target initializer rows;
- 40,110 target partition rows;
- 13,310,031 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked attribution, not a claim
that an ancestor map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    76c6de9c8ff81434d1e7a4292fb5f13d402bac993a90f946b8a7ed551c16520c \
  --expected-bytes 2155917 \
  --expected-baseline-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-tokens 4257140 \
  --expected-target-units 18570
```

Every target token must appear exactly once. This case classifies 3,271,381
as matched, 136,686 as moved candidates, 376,613 as coarse changed
candidates, and 472,460 as explicitly unresolved.

## 8. Generate the readable full-bundle diff

On an 8 GiB host, use a 6 GiB old-space limit:

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988
```

Heap size does not affect canonical output. Require the target
comparison-invariant hash to remain unchanged before and after accepted
alpha renames and statement normalization.

```text
metadata.json              3,914 bytes
normalized.diff.gz     6,224,813 bytes
statements.diff          729,121 bytes
renames.tsv              196,595 bytes
```

## 9. Localize source-facing changes conservatively

Use all of these together:

1. the 46 pinned release-note bullets;
2. exact adjacent changed branches;
3. source-oracle ownership candidates;
4. structural pairs and the readable diff;
5. the verified 2.1.96 source tree;
6. public declaration changes; and
7. exact target control flow, operators, constants, and call order.

Require a defensible authored path before editing `src/`. If only generated
runtime behavior is observable, leave it in the exact bundle recovery.

The accepted source-facing clusters are:

- status-line refresh and `workspace.git_worktree`;
- retry, MCP OAuth, and prototype-name hardening;
- edit-history capping and subagent tool statistics;
- Zellij/Warp terminal handling and Cedar highlighting; and
- W3C trace propagation into Bash subprocesses.

The Bedrock empty-string change is dependency-owned. The adjacent application
Bedrock paths are unchanged, so do not invent an application-source edit.

## 10. Freeze the reversible source overlay

Create one Git patch containing the 19 changed files and two added Cedar
modules:

```sh
git diff --binary -- src > \
  "$RECOVERY_WORK/statusline-and-runtime-hardening.patch"
```

When additions are untracked, append their `git diff --no-index /dev/null`
records or stage them with intent-to-add before generating the patch. Verify
both directions in a temporary source copy:

```sh
git apply --check --reverse \
  "$CASE/recovered/statusline-and-runtime-hardening.patch"
```

The canonical patch is 637,826 bytes with SHA-256
`a3f5301f93bcfc392d61d3470641b6eed9652c1828d85b3186037fba35cb77bc`.

Record both source-tree summaries:

```text
2.1.96 base    1,931 files  30,687,527 bytes
sha256         2485f83f856b3b49188d0c1ca6125dec64959240ce149291306926cb1deed717

2.1.97 target  1,933 files  30,696,402 bytes
sha256         62292e92d77b622cf5290282387921c1464a35d8bac8b1d7c312d7bd03a0c289
```

## 11. Bind behavior to exact target fragments

Add unique start/end delimiters, byte lengths, and SHA-256 hashes for every
source-facing behavior. This case records 19 fragments covering status-line,
retry, OAuth, permissions, file-edit, tool-stat, transcript, terminal, Cedar,
and tracing changes.

Every fragment must:

- occur at the expected target location;
- reproduce the pinned bytes and SHA-256;
- be explained exactly once by the recovery ledger; and
- be exercised by a target-backed semantic test when practical.

Run the evidence verifier:

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

## 12. Verify source lineage

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

The verifier must:

1. match the repository's target tree;
2. reverse the patch to the exact 2.1.96 source summary;
3. reapply it to the exact 2.1.97 source summary;
4. byte-compare the reconstructed tree with the repository;
5. Bun-build all 21 changed source paths; and
6. pass all eight focused target-backed tests.

## 13. Reconstruct the complete package

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.96/package.tgz" \
  --output "$RECOVERY_WORK/package-2.1.97"
```

Require:

```text
status                 exact-package-tree-reconstructed
members                20
bytes                  48,991,994
framed tree sha256     c616574993d24d0d99db6597dac55c7b03074d7b3134ae1aa91f1dfff48c189c
target bundle sha256   4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988
```

## 14. Run the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.96/package.tgz"
```

The required final status is:

```text
complete-recovery-verified
```

This single command rechecks immutable evidence, source ownership, declaration
replay, target fragments, source lineage, syntax, semantic tests, the exact
bundle delta, attribution, structural accounting, readable-diff invariants,
and the complete package tree.

## Reuse for the next release

For a later version, change only release-specific inputs and assertions:

1. choose the immediately preceding published package;
2. authenticate both archives and compare every member;
3. generate an exact delta for each changed opaque member;
4. express inspectable metadata/declaration changes as strict exact edits;
5. regenerate attribution, structural, and readable ledgers;
6. localize only defensible authored paths;
7. freeze a reversible incremental patch and source-tree hashes;
8. bind each source claim to exact target fragments and tests; and
9. require the aggregate gate to reproduce the authenticated target.

Do not weaken hashes, reuse stale ledgers, apply an ancestor source map to
target offsets, or turn uncertain module placement into asserted source.

## Semantic source reproduction check

Run the fail-closed semantic audit after acquiring the adjacent artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require all 4,450 nonmatched units to be classified, zero first-party source
runtime gaps, and 35 explicitly unresolved dependency-runtime gaps. Missing
root dependency/build inputs keep the whole-bundle-from-source verdict false.
