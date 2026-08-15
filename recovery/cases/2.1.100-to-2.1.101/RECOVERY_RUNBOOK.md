# 2.1.100 → 2.1.101 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.101 from the verified 2.1.100 base.

The result has two explicit confidence levels:

1. The published 2.1.101 bundle, declarations, and npm package tree are
   recovered exactly.
2. Authored TypeScript is recovered only where the generated target provides
   sufficient placement evidence. Erased spelling and module boundaries are
   not invented.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.100-to-2.1.101
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the adjacent published release

Resolve exact npm versions, never a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.100 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.101 version dist --json
```

Confirm from the registry packument that no published version falls between
them:

```text
2.1.100  published 2026-04-10T05:00:41.623Z
2.1.101  published 2026-04-10T18:41:55.480Z
```

Cross-check the official tag identities:

```sh
git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.100 \
  refs/tags/v2.1.101
```

Require:

```text
c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917  refs/tags/v2.1.100
9772e13f820002c9730af67a2409702799c7ddc6  refs/tags/v2.1.101
```

The GitHub commit record for
`9772e13f820002c9730af67a2409702799c7ddc6` must have exactly one parent,
`c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917`. This direct lineage is a
provenance cross-check; the authenticated npm artifacts remain the executable
oracles.

Pin the changelog at the target commit. Its 2.1.101 section has exactly 46
bullets, but use those bullets only as semantic locators. The exact adjacent
bundle and package diff decides whether a note describes a 2.1.100 →
2.1.101 CLI change. For example, API timeout and numeric environment-value
handling and the `/team-onboarding` command already exist in the baseline,
while Agent SDK `query()` cleanup is shipped in a separate SDK artifact.

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
  --baseline "$RECOVERY_ARTIFACTS/2.1.100/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.101/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.100 \
  --target-version 2.1.101 \
  --baseline-shasum 76b95d381909776db544099e4f75b61c85ee9746 \
  --target-shasum 7bfeb26d4a30d1d595238fcc0c77a03578765e4e \
  --baseline-integrity \
    'sha512-bt6unBToiPZqDfMLIKCk8i3CHJqKYnGNHQ2iYt0VKX0Zxoa0g6WOdLM9mw8XGpYSMUaaovUIzdLbJ9XKeng4cQ==' \
  --target-integrity \
    'sha512-abVVCKMDKl9jHzgoUhhBVAQY2fKVdLt13ag5EEDlybRUCRL+rEAZfBxOdQnKZbzH1AUW5VwqiELeMHFauO51DQ==' \
  --baseline-signature \
    'MEYCIQC9lUx0f9sUbdqaDxiz5q/A0Qf9pSD877Ze1wOFBxmgnAIhANhm8H94XwcjQVaoI6SlqoQbM+Wp5bxtsH3Tekn4ikuC' \
  --target-signature \
    'MEUCIHQpLCVRpNHYtDtd9exDJA9bNc/HYuiYbvJkW5XuSO14AiEAlN7OuPCD6ozycFxIkQ0tLdBtNRoK31bSQ9C7C5E6hTQ=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.100.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.101.tgz'
```

Require:

```text
20 baseline members
20 target members
18 unchanged
2 changed
0 added
0 removed
0 mode-only changes
complete = true
```

The complete changed set must be `package/cli.js` and
`package/package.json`. Both tarballs must pass registry SHA-1 and SHA-512
checks, and both signatures must verify under the pinned registry key.
Member paths, types, link targets, modes, sizes, and hashes are checked
independently.

The canonical comparison file is 13,704 bytes with SHA-256:

```text
80b10925ac97568949a97e1c6fefe79e69848d9f584ebfc78c1af588ff073059
```

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.100 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

```text
source-oracle bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
source-oracle map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never apply the 2.1.88 map directly to 2.1.100 or 2.1.101 offsets. It
provides exact ownership only for its matching 2.1.88 generated bundle.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```

The builder reconstructs and byte-compares the target before succeeding.

```text
delta bytes   2,096,082
delta sha256  afebd886bd0b9fa19862e9d6dab101ab32b014508c9bec8772853a0a8da22088
```

The stored delta must be identical to
[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta).

## 5. Prove metadata and declarations

Diff the adjacent public declarations directly:

```sh
cmp \
  "$RECOVERY_ARTIFACTS/2.1.100/package/sdk-tools.d.ts" \
  "$RECOVERY_ARTIFACTS/2.1.101/package/sdk-tools.d.ts"
```

They must be byte-identical. Encode this in
`targetAssertions.declarationChange` as `{ "kind": "unchanged" }`. Both files
are 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.

The only `package.json` change must be the unique version replacement
2.1.100 → 2.1.101:

```text
baseline  1,371 bytes  9883a3be5ed9a7b3dc917a9ae55fd5e98b5f9505ee8ba77a410dcc7d4557fcad
target    1,371 bytes  b24c2b43b9d276ebe81495691a59c659be0e1b601012e249603c6c2106a0af69
```

Do not create a declaration delta or infer an API declaration change.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.101/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.101/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-9772e13f.md" \
  --changelog-section 2.1.101
```

Require:

- 4,756 baseline source rows;
- 4,627 target initializer rows;
- 39,867 target partition rows;
- 39,866 monotone exact anchors;
- 13,500,405 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

Verify the canonical streams and identities:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    875e8ec5b1fe9c8c5358dd03030a0c9394ea63bd1ba699d105051577066ef9c4 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```

The changelog participates as provenance and a semantic signal; it does not
override the adjacent generated diff. This inventory is exact target-offset
accounting with evidence-ranked attribution, not a claim that an ancestor
map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    d42ac601193aa9ac1f087a812d54f095e97eafe1ce428541db31552d809f9e85 \
  --expected-bytes 2139287 \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-tokens 4317367 \
  --expected-target-units 18910
```

Every target token must appear exactly once. Require:

```text
matched                    3,754,276 tokens / 16,388 units
moved candidate               21,923 tokens /  1,167 units
coarse changed candidate      36,589 tokens /    134 units
unresolved pairing           504,579 tokens /  1,221 units
total                      4,317,367 tokens / 18,910 units
```

`unresolved` means conservative pairing was withheld, not that generated
target code is absent.

## 8. Generate the readable full-bundle diff

On an 8 GiB host, use a 6 GiB old-space limit and do not run this concurrently
with attribution:

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```

Heap size does not affect canonical output. Verify it:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$RECOVERY_WORK/readable-diff" \
  --expected-metadata-sha256 \
    b4fbcbe4b50baede64993a65679fd9f66704f1e596f824d1f922481c88b5fd11 \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```

Require target comparison-invariant hash
`f242ae22a14c5b61c62d7fde39a56477a0888fc4b460ec9d7376db739951e4e2`
before alpha rename, after rename, and after statement normalization.

The canonical compressed full diff is 5,554,934 bytes with SHA-256:

```text
257b0d946ec83133ab04440c5d939d0255c0a73a7a7774a75b8f9629b359e9c9
```

The normalized target is a non-executable comparison view. Rejected binding
alignments remain unchanged, and accepted renames do not claim equivalence
where JavaScript can observe binding spelling.

## 9. Localize only defensible source edits

Use the adjacent structural and readable comparison as the authority. The
2.1.88 map provides baseline ownership, but cannot prove target TypeScript
names, formatting, or module boundaries.

For every source-facing edit:

1. identify a target-only or changed generated fragment;
2. prove its exact 2.1.100 baseline state;
3. map it to an existing owner only when responsibility and call position
   are unambiguous;
4. preserve observable target literals, operators, ordering, and error
   handling;
5. label inferred authored spelling as equivalent rather than exact; and
6. bind the result to hash-pinned target evidence and a focused test.

The accepted overlay covers these owner groups:

- virtual-message rendering lifetime;
- focus prompt, thinking cadence, and raw control-key parsing;
- CA-store configuration, provider environment classification, and startup
  telemetry;
- refusal details and API authentication/header handling;
- permission hook precedence;
- cleanup retention safety;
- ripgrep re-resolution;
- session-chain live-leaf recovery;
- hook-event validation guidance; and
- argv-safe executable lookup.

Keep the in-memory settings-refresh signal and brief-mode plain-text retry in
the exact bundle layer. They are adjacent generated changes, but this recovery
does not have sufficiently strong owner and call-position evidence to add
them to authored source. Handle every other unplaced adjacent change the same
way. Do not translate all 46 changelog bullets into speculative edits, and do
not re-add behaviors that are already in 2.1.100 or belong to a separate SDK
artifact.

Generate one reversible patch over only the 16 accepted paths:

```sh
git diff --binary -- \
  src/components/VirtualMessageList.tsx \
  src/constants/prompts.ts \
  src/ink/parse-keypress.ts \
  src/main.tsx \
  src/screens/REPL.tsx \
  src/services/api/claude.ts \
  src/services/api/client.ts \
  src/services/api/errors.ts \
  src/services/tools/toolHooks.ts \
  src/utils/caCerts.ts \
  src/utils/cleanup.ts \
  src/utils/managedEnvConstants.ts \
  src/utils/ripgrep.ts \
  src/utils/sessionStorage.ts \
  src/utils/settings/validationTips.ts \
  src/utils/which.ts \
  > "$CASE/recovered/security-resume-and-runtime.patch"

git apply --check --reverse \
  "$CASE/recovered/security-resume-and-runtime.patch"
```

Require:

```text
patch bytes   250,755
patch sha256  a9ef6896211e558bab6b0063fe34b0875b8b598216e4ef3d1fdd1cd78a0aa802
paths         16
insertions    407
deletions     229
```

Run the focused source and adjacent-bundle checks:

```sh
CLAUDE_CODE_2_1_100_BUNDLE="$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
CLAUDE_CODE_2_1_101_BUNDLE="$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.101-core-overlay.test.mjs
```

All five tests must pass. The source-lineage gate additionally:

1. checks the applied 2.1.101 source-tree digest;
2. reverse-applies the patch in an isolated temporary tree;
3. checks the exact 2.1.100 source-tree digest;
4. reapplies the patch and byte-compares the complete result;
5. Bun-builds all 16 changed paths; and
6. reruns the target-backed tests with authenticated bundle inputs.

The required source identities are:

```text
2.1.100 base
files   1,933
bytes   30,699,758
sha256  47eb501c55779f8661dcd50c6b86c298fd85711ebe81300dd43b0a1539d58dad
commit  71adf7f36c3522c296770374910eb1834dfe5d59
tree    c19e46029d1f5e75e67b25203b10ac093fdded6f
src     c333e6b77392e2bc5e7750a6246a9375caa5703a

2.1.101 applied overlay
files   1,933
bytes   30,704,971
sha256  80d66c4083b2f5c7d783735d1edb766f9bcb6606cbfb9bc099271ed108d9c853
```

These checks prove the chosen overlay is reversible and reproducible. They
do not prove the erased original TypeScript spelling.

## 10. Reconstruct the package and close every gate

Reconstruct the complete target package:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.100/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"
```

The reconstructor must byte-match all 20 authenticated target members and
produce this framed package-tree SHA-256:

```text
31db03d726238058bb691208a6e0c3698ff0e2384c1ef7c4d9a5925e5736d154
```

Then run the aggregate verifier:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.100/package.tgz"
```

The expected top-level result is `complete-recovery-verified`. The gate
verifies immutable artifact identity, npm authentication, exact bundle
replay, unchanged declarations, exhaustive package reconstruction,
attribution coverage, structural accounting, readable-diff invariants,
source lineage, syntax, and target-backed tests.

The exact output identities are:

```text
2.1.101 cli.js SHA-256
bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb

2.1.101 framed package tree SHA-256
31db03d726238058bb691208a6e0c3698ff0e2384c1ef7c4d9a5925e5736d154
```

## Semantic source reproduction check

Run the fail-closed semantic audit after acquiring the adjacent artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require all 2,522 nonmatched units to be classified, zero first-party source
runtime gaps, and 16 explicitly unresolved dependency-runtime gaps. Missing
root dependency/build inputs keep the whole-bundle-from-source verdict false.
