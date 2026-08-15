# 2.1.91 → 2.1.92 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.92 from the verified 2.1.91 base.

The result has two explicit confidence levels:

1. The published 2.1.92 bundle and npm package tree are recovered exactly.
2. Authored TypeScript is recovered only where the minified target provides
   sufficient evidence. Erased source spelling is not invented.

Keep the semantic and build-input verdicts separate. The exhaustive
3,132-row ledger has zero first-party source-runtime gaps, including exact
owners for the Bedrock wizard and hidden `/setup-bedrock` command. It retains
185 unpinned dependency-runtime gaps and records the absent root
manifest/lockfile and hermetic recipe, so `src/` does not reproduce the whole
bundle. Exact `cli.js` bytes are independently replayed from the generated
delta.
The canonical semantic supplement is 5,567,219 bytes across 147 `src/`
paths, SHA-256
`43b7f3165ca0502796e26a50e821c12a47b8bc95dc78a5744361091e0adf9062`.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.91-to-2.1.92
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Freeze the adjacent releases

Resolve exact npm versions, never a mutable tag. Record for each tarball:

- registry URL and compressed byte length;
- registry SHA-1 and SHA-512 SRI;
- registry ECDSA signature and key ID; and
- locally computed SHA-256.

The adjacent tarballs are:

```text
2.1.91  16,522,495 bytes
sha256  4fb4dae771d6fad1e74703741148f5ee2d24837f4a04eab27041746f7a5b3e2b

2.1.92  17,164,906 bytes
sha256  fff885f916e6b3a71853559601af12abb1b64714cfc2f0635a25613b96749347
```

Pin the official changelog by commit, not by a moving branch. This case uses
commit `b543a256248ce5ff98804b8dfef4cd6247423d98`.

Download and hash-check all manifest inputs:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

The acquisition step also extracts and verifies the archive members used by
later commands.

## 2. Authenticate and compare every package member

Run the exhaustive tar comparison with the pinned registry metadata:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.91/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.92/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.91 \
  --target-version 2.1.92 \
  --baseline-shasum f7c6050592b4a7c10074eacda07872f79875dc61 \
  --target-shasum 536b5c573ae5d3ba85ace514e2e72d37c3d5e464 \
  --baseline-integrity \
    'sha512-RvSjgk4yKfwjByUK+r6LXHU0aXLse0omlWhBefiFJhCyNAB8sc3NHc3N7+7CPaBLC/s3MHf3AQHSYqi6V8ltuA==' \
  --target-integrity \
    'sha512-mNGw/IK3+1yHsQBeKaNtdTPCrQDkUEuNTJtm3OBTXs4bBkUVdIgRme/34ZnbZkl2VMMYPoNaTvqX2qJZ9EdSxQ==' \
  --baseline-signature \
    'MEUCIQCQubDdTodhmZh056FJOdAiUYNEWqq9qygWlJUAhdBp8AIgKXp4FeChs8AK+zrjgED2LflP2OS13NG/ivBCIK9N2p8=' \
  --target-signature \
    'MEUCIA9Pbrb5aRJaP0BIUvY7wPnYuXxf1bmtO2STf8s5CFUrAiEA5Ls/eijn2heuQIP7Mft2b0HcFrhaQgUt61c78t2tvYM=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.91.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.92.tgz'
```

Require:

```text
18 baseline members
20 target members
16 unchanged
2 changed
2 added
0 removed
complete = true
```

Inspect content, type, link target, and mode independently. The complete
non-unchanged set must be:

- changed `package/cli.js`;
- changed `package/package.json`;
- added `package/vendor/seccomp/arm64/apply-seccomp`; and
- added `package/vendor/seccomp/x64/apply-seccomp`.

The two signatures must verify under the pinned registry key. The target
declaration member must compare byte-identical.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.91 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

The source oracle is:

```text
bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never treat the 2.1.88 map as a direct map for 2.1.91 or 2.1.92.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362
```

The builder reconstructs and byte-compares the target before succeeding.
Expected delta:

```text
bytes   2,285,915
sha256  125d66c66450debe0d6220fb5e351946095224e78de75d61b214908a89fa124a
```

## 5. Preserve target-only package members exactly

The adjacent baseline cannot supply the two new `apply-seccomp` binaries.
Compress the authenticated target members deterministically:

```sh
mkdir -p "$RECOVERY_WORK/seccomp/arm64" "$RECOVERY_WORK/seccomp/x64"

pixi run zstd -19 --single-thread --no-progress --force \
  "$RECOVERY_ARTIFACTS/2.1.92/package/vendor/seccomp/arm64/apply-seccomp" \
  -o "$RECOVERY_WORK/seccomp/arm64/apply-seccomp.zst"

pixi run zstd -19 --single-thread --no-progress --force \
  "$RECOVERY_ARTIFACTS/2.1.92/package/vendor/seccomp/x64/apply-seccomp" \
  -o "$RECOVERY_WORK/seccomp/x64/apply-seccomp.zst"
```

Require:

```text
arm64 payload  240,857 bytes
sha256          3e3c4e804c4b88303f80a635eff83f5138812274aa34c2fbe1fd695e2851fbe6

x64 payload    294,356 bytes
sha256          5a973d6bfedaf645979b2ebd8886799ef7f682fb277d96ed88f2e72deea3485a
```

Record one `generatedRecovery.packageMembers.addedMemberPayloads` recipe for
each target-only member. Each recipe names the exact member, case-relative
payload path, and `zstd` algorithm. Reconstruction must fail on missing,
duplicate, unused, unsafe, or non-regular payload recipes.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.92/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.92/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-b543a25.md" \
  --changelog-section 2.1.92
```

Require:

- 4,756 baseline source rows;
- 4,579 target initializer rows;
- 43,047 target partition rows;
- 13,157,503 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked target attribution, not
a claim that an ancestor map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    7d0d2e0a8e427c88d855ab462ba6a38a979dc2d8d7283e2cd667d975802596bf \
  --expected-bytes 2117355 \
  --expected-baseline-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-tokens 4247953 \
  --expected-target-units 18450
```

Every target token must appear exactly once. Leave unsupported baseline
pairings unresolved instead of guessing. This case classifies 3,667,147
tokens as matched, 12,395 as moved candidates, 118,809 as coarse changed
candidates, and 449,602 as unresolved pairings.

## 8. Generate the readable full-bundle diff

```sh
pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362
```

Require the comparison-invariant target hash to remain unchanged before and
after accepted alpha renames and statement normalization. Preserve rejected
renames in `metadata.json`. The checked-in output includes the complete
compressed normalized diff, a compact statement diff, and a rename ledger.

## 9. Recover package metadata exactly

`sdk-tools.d.ts` is unchanged. For `package.json`, first replace version
`2.1.91` with `2.1.92`, then perform one exact insertion:

```text
anchor      "    \"vendor/audio-capture/\""
insert      ",\n    \"vendor/seccomp/\""
```

The insertion is after the unique anchor and before the existing newline.
`exact-text-insertion.mjs` rejects missing or duplicate anchors.

`reconstruct-package.mjs` applies the version and insertion recipe, restores
the target bundle from the exact delta, decompresses both target-only member
payloads, and checks every result against the authenticated target archive.

## 10. Localize source-facing changes

Use all of these together:

1. the 21 pinned official release-note entries;
2. exact target-only and changed literals;
3. source-oracle ownership candidates;
4. adjacent structural pairs and the readable diff;
5. the verified 2.1.91 source tree; and
6. exact target control flow, operators, constants, and call order.

For each source-facing claim, pin a unique target fragment by:

- start delimiter;
- exclusive end delimiter;
- byte length; and
- SHA-256.

This case pins 15 fragments. The manifest requires each fragment to have
exactly one recovery explanation and every recovered file to be hash-pinned
and referenced.

Release notes are localization hints, not byte authority. Do not reconstruct
unrelated changelog bullets when the adjacent generated evidence does not
support a defensible authored-source placement. Preserve exact published
runtime bytes in the generated recovery even where authored TypeScript is
unobservable.

## 11. Apply the defensible source overlay

On the verified 2.1.91 tree, apply:

```sh
git apply "$CASE/recovered/startup-and-remote-settings.patch"
git apply "$CASE/recovered/prompt-hook-policy.patch"
git apply "$CASE/recovered/streamed-tool-input-coercion.patch"
git apply "$CASE/recovered/homebrew-cask-channel.patch"
git apply "$CASE/recovered/tmux-stable-window.patch"
git apply "$CASE/recovered/cursor-end-of-line.patch"
git apply "$CASE/recovered/release-notes-and-command-removals.patch"
```

The overlay is already applied in this repository. Do not apply it twice.
The lineage verifier reverse-checks and reapplies it in a temporary copy.

The patches recover:

- managed remote-settings fail-closed refresh and Remote Control prefixes;
- Stop/SubagentStop prompt-hook policy;
- streamed array/object JSON coercion;
- Homebrew cask channel preservation;
- stable tmux window IDs;
- Ctrl+E wrapped-line behavior; and
- interactive release notes plus `/tag` and `/vim` removal.

The final patch is a true source transition: it deletes
`src/commands/release-notes/release-notes.ts` and adds
`src/commands/release-notes/release-notes.tsx`.

## 12. Pin and verify the source lineage

Tree hashes frame records sorted by path as:

```text
src/path\0bytes\0sha256\n
```

The exact base is:

```text
commit       cb8a3dbe788589c66326d345c54d35abd5603850
Git tree     f5b8d8f90f4adda730b4b0bef07d1eac30844aba
Git src tree ceb85b1fb08325c2fb8946d523bc3fe0f7fd5adf
files        1,930
bytes        30,661,962
framed hash  5a74a719338766ab26023fc4041013bce9ff968356d152cb7df725bdab8a4108
```

The recovered target is:

```text
files        1,930
bytes        30,672,193
framed hash  18f5471774fe00053622904e4fa157592d1c887b6b7bed32fe9528b62ca0e42e
```

Verify both directions:

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

The verifier:

1. hashes the repository target tree;
2. reverse-applies the seven patches in reverse order;
3. proves the exact 2.1.91 base tree;
4. reapplies the patches in order;
5. byte-compares the reconstructed target with the repository;
6. Bun-builds all 16 final changed TypeScript/TSX files; and
7. runs 10 target-backed semantic tests.

A source assertion with `target: "absent"` represents a source-map-owned
baseline file deleted by the overlay. It must not carry target byte or hash
fields. This is separately covered by verifier regression tests.

Expected status is `source-lineage-verified`.

## 13. Reconstruct the complete package tree

Create a non-existent output path:

```sh
RECOVERED_PARENT=$(mktemp -d)

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.91/package.tgz" \
  --output "$RECOVERED_PARENT/package"
```

The reconstructor must:

- copy all 16 byte-identical members with their target modes;
- reconstruct `cli.js` from the exact delta;
- replace the package version and perform the unique whitelist insertion;
- reconstruct both `apply-seccomp` helpers from their exact payloads;
- reject undeclared or unused added-member recipes;
- compare every output member with the authenticated target archive; and
- verify the framed target-tree hash.

Expected result:

```text
status             exact-package-tree-reconstructed
members            20
bytes              44,517,413
framed tree sha256 e8abc7a21bab293650f17f5d3abd85b026132e6f53831c4c34499bd839ebe777
```

## 14. Close the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.91/package.tgz"
```

This one command verifies:

- every external artifact;
- source-oracle topology and cumulative repository overlay hashes;
- all target fragments and recovery-file assertions;
- bidirectional incremental source lineage;
- exact bundle reconstruction;
- exhaustive attribution;
- complete structural token accounting;
- readable-diff invariants;
- focused recovery tests; and
- the exact 20-member package tree, including both target-only helpers.

Expected status:

```text
complete-recovery-verified
```

## 15. Run focused regression tests

The aggregate gate runs the case's 10 target-backed semantic tests. Exercise
the new reconstruction and source-deletion verifier paths directly as well:

```sh
CLAUDE_CODE_2_1_91_BUNDLE="$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
CLAUDE_CODE_2_1_92_BUNDLE="$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
pixi run node --test \
  recovery/test/reconstruct-package.test.mjs \
  recovery/test/recovery-2.1.92-commands.test.mjs \
  recovery/test/recovery-2.1.92-core-overlay.test.mjs \
  recovery/test/recovery-2.1.92-hooks.test.mjs \
  recovery/test/recovery-2.1.92-remote-settings.test.mjs \
  recovery/test/verify-case-source-deletion.test.mjs
```

The full recovery suite also includes prior-release tests. Supply its pinned
2.1.89 and 2.1.90 bundles in
`CLAUDE_CODE_2_1_89_BUNDLE` and `CLAUDE_CODE_2_1_90_BUNDLE`, then run:

```sh
pixi run npm --prefix recovery test
```

## 16. Reuse the method for the next release

For 2.1.93 or later:

1. use the current exact target package as the adjacent baseline;
2. retain the newest matching mapped ancestor strictly as a source oracle;
3. authenticate both tarballs and inventory every member;
4. regenerate exact-delta, attribution, structural, and readable outputs;
5. express changed metadata as unique exact transformations;
6. preserve every target-only regular member as a hash-pinned payload recipe;
7. add only target-fragment-backed source patches or explicitly scoped models;
8. pin pre- and post-overlay full-tree hashes;
9. reverse and forward verify the patch chain; and
10. require the aggregate gate before publishing the recovery.

This keeps each release independently replayable while preserving the
essential boundary: exact published-code recovery can coexist with partial
authored-source recovery.
