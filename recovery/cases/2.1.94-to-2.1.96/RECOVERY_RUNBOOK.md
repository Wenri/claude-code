# 2.1.94 → 2.1.96 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.96 from the verified 2.1.94 base. Upstream did not publish
2.1.95, so this is one step in published-release order even though the patch
number advances by two.

The result has two explicit confidence levels:

1. The published 2.1.96 bundle and npm package tree are recovered exactly.
2. Authored TypeScript is recovered only where the generated target provides
   sufficient placement evidence. Erased spelling and module boundaries are
   not invented.

The exhaustive 75-row semantic ledger has zero first-party source-runtime
gaps and pins reachable owners for all three Bedrock `apiKey` sites. It still
records two dependency-runtime gaps plus the absent root manifest/lockfile and
hermetic build recipe. Therefore first-party compiled semantics are complete,
whole-bundle source reproduction is not, and exact `cli.js` bytes remain a
separate generated-delta replay claim.
The canonical semantic supplement is 4,321,868 bytes across 106 `src/`
paths, SHA-256
`dba122f721559133bdad7970c15ccda26c9dfcef2c5d0e82de65dbffdb2c1542`.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.94-to-2.1.96
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the next published release

Resolve exact npm versions, never a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.95 version --json
pixi run npm view @anthropic-ai/claude-code@2.1.96 version dist --json
```

The first lookup must report no matching 2.1.95 version. The full npm
packument has no 2.1.95 version or publication-time entry. The official
GitHub API also has no `v2.1.95` tag; `v2.1.96` resolves to commit
`227817d0f2cae5536273e78422c49bb89af859ca`.

Do not invent an intermediate archive or concatenate two unobserved deltas.
Use 2.1.94 as the adjacent baseline and 2.1.96 as the target.

The published tarballs are:

```text
2.1.94  18,527,047 bytes
sha256  14a2aa53b5227d165f629bcad120c13fc09728168445c95e95641d62c4b00382

2.1.96  18,527,078 bytes
sha256  46d70278ea9ac6a8f9c0b772a562c7b90be00a11caa9ba006bc99fbc3a88de58
```

Pin the official changelog at the 2.1.96 tag commit, not a moving branch.
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
  --baseline "$RECOVERY_ARTIFACTS/2.1.94/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.96/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.94 \
  --target-version 2.1.96 \
  --baseline-shasum ce7eb277e592cfb4d3368af17a7690d39566aebd \
  --target-shasum d528e9638292c7b275c896b283e4a8e6959ef0ef \
  --baseline-integrity \
    'sha512-zOHw8NxxXYinL4vNrkdFfTUAri9Jdl2wIAFAmwUJW4M1cTxbhKLHND2VldySIFIpuTtPONyRmHtxU88mLvde9Q==' \
  --target-integrity \
    'sha512-ETrc0+1qWHaqtKi+ixbsAecZyM+H52VIJj+zWIvw3jBU/JZ9v5vnE2kHShM1lcpr+Gji7GXk23l0CMGLA7hC0g==' \
  --baseline-signature \
    'MEUCIEj1owBPiLzNMHX89FPMiEKFzob7CRPkh1FRNGxrhyyIAiEA7kZ4JLJU0B4Nn3XWyuyv7WYa+PDgGkY8H1bB5XqrM8o=' \
  --target-signature \
    'MEUCIDfVFVFY0qtDRV8JGrx0/QKyh70/hWuV+lO0LSTt2zz6AiEA20JmCcoQACXgZOSLdrLxZ8I2356j3KvBbianSlhxu0A=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.94.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.96.tgz'
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
`package/package.json`. Declarations and all vendor members must compare
byte-identical. Both signatures must verify under the pinned registry key.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.94 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

The source oracle is:

```text
bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never apply the 2.1.88 map directly to 2.1.94 or 2.1.96 offsets.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e
```

The builder reconstructs and byte-compares the target before succeeding.

```text
delta bytes   319,590
delta sha256  0739b86c55b23697173396ef29737191f45ef0ad9c1479e4666484842f67d1c5
```

No separate vendor payload is needed because every vendor member is
unchanged.

## 5. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.96/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.96/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-227817d.md" \
  --changelog-section 2.1.96
```

Require:

- 4,756 baseline source rows;
- 4,584 target initializer rows;
- 42,859 target partition rows;
- 13,244,035 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked attribution, not a claim
that an ancestor map directly maps the target.

## 6. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    cc05ee5d259f5c82d115a1b957a0e7d689bbbbc3dbfece3653c4ca9c39a1d3ad \
  --expected-bytes 1889150 \
  --expected-baseline-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-tokens 4266673 \
  --expected-target-units 18564
```

Every target token must appear exactly once. This case classifies 4,190,103
tokens as matched and 76,570 as explicitly unresolved; it makes no unsupported
moved or coarse-changed pairing claims.

## 7. Generate the readable full-bundle diff

On memory-constrained 8 GiB hosts, pass a 6 GiB old-space limit explicitly so
the wrapper does not request an 8 GiB heap:

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e
```

Heap size does not affect canonical output. Require the comparison-invariant
target hash to remain unchanged before and after accepted alpha renames and
statement normalization.

Expected checked-in output:

```text
metadata.json              3,751 bytes
normalized.diff.gz     2,822,443 bytes
statements.diff           30,642 bytes
renames.tsv               40,992 bytes
```

## 8. Recover package metadata exactly

`sdk-tools.d.ts` is unchanged. For `package.json`, uniquely replace version
`2.1.94` with `2.1.96`. No insertion, deletion, or other metadata rewrite is
required.

`reconstruct-package.mjs` applies the version recipe, restores the exact
target bundle from the delta, copies the other 18 target-identical members,
and checks every output against the authenticated target archive.

## 9. Localize source-facing changes

Use all of these together:

1. the one pinned official release-note entry;
2. exact adjacent changed branches;
3. source-oracle ownership candidates;
4. structural pairs and the readable diff;
5. the verified 2.1.94 source tree; and
6. exact target control flow, operators, constants, and call order.

After neutralizing only embedded version, build timestamp, and absolute build
root metadata, exactly three semantic sites plus one helper remain:

- the main API client's Bedrock branch;
- a new case-insensitive Authorization-header extraction helper;
- a target-only Bedrock setup-wizard bearer client; and
- a target-only Bedrock model-upgrade probe.

The main client and helper map uniquely to `src/services/api/client.ts`. The
other two generated modules fall between mapped oracle sources but did not
exist in the 2.1.88 oracle or current recovered tree. Preserve their exact
target fragments and test their behavior, but do not fabricate exact authored
paths.

The manifest pins four unique target fragments by start delimiter, exclusive
end delimiter, byte length, and SHA-256. Every fragment has exactly one
recovery explanation.

## 10. Apply the defensible source overlay

On the verified 2.1.94 tree:

```sh
git apply "$CASE/recovered/bedrock-auth.patch"
```

The overlay is already applied in this repository. Do not apply it twice.
The lineage verifier reverse-checks and reapplies it in a temporary copy.

The patch modifies one existing path:

```text
src/services/api/client.ts
```

It recovers case-insensitive Authorization extraction, bearer/custom-header
precedence, Bedrock SDK `apiKey` use, header de-duplication, and the no-key
skip-auth fallback.

## 11. Pin and verify source lineage

Tree hashes frame records sorted by path as:

```text
src/path\0bytes\0sha256\n
```

The exact base is:

```text
commit       7edbf6deb50ef0c59765d3e6d05170b52915dac1
Git tree     56bc88e147fe777986d9dded4323152fd0d36f1d
Git src tree 5d91a61b7dccef04ad1218df9729d1cb855d4b22
files        1,931
bytes        30,686,905
framed hash  f24db0beefa396a41d5a37101ef6089df6ab185d1813b7e75663854202a10892
```

The recovered target is:

```text
files        1,931
bytes        30,687,527
framed hash  2485f83f856b3b49188d0c1ca6125dec64959240ce149291306926cb1deed717
```

Verify both directions:

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

The verifier hashes the current tree, reverse-applies the patch, proves the
exact 2.1.94 base, reapplies the patch, byte-compares the target, Bun-builds
the changed TypeScript file, and runs three target-backed semantic tests.
Expected status is `source-lineage-verified`.

## 12. Reconstruct the complete package tree

Create a non-existent output path:

```sh
RECOVERED_PARENT=$(mktemp -d)

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.94/package.tgz" \
  --output "$RECOVERED_PARENT/package"
```

Expected result:

```text
status             exact-package-tree-reconstructed
members            20
bytes              48,924,836
framed tree sha256 17d169a1338c92dd7dd42f8f64627ba14d206e27c36db5826995fc0c4aff9446
```

## 13. Close the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.94/package.tgz"
```

This verifies:

- every external artifact;
- source-oracle topology and cumulative overlay hashes;
- all target fragments and recovered-file assertions;
- bidirectional incremental source lineage;
- exact bundle reconstruction;
- exhaustive attribution;
- complete structural token accounting;
- readable-diff invariants;
- focused recovery tests; and
- the exact 20-member package tree.

Expected status:

```text
complete-recovery-verified
```

## 14. Run focused regression tests

```sh
CLAUDE_CODE_2_1_94_BUNDLE="$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
CLAUDE_CODE_2_1_96_BUNDLE="$RECOVERY_ARTIFACTS/2.1.96/package/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.96-bedrock-auth.test.mjs
```

The focused command passes three tests. They assert both the defensible source
overlay and all three exact generated Bedrock-auth sites.

As a cumulative regression check, supply every historical bundle environment
variable used by `recovery/test/*.test.mjs` and run:

```sh
pixi run npm --prefix recovery test -- --test-concurrency=1
```

For this recovery, the complete suite passes all 105 tests with no skips.

## 15. Reuse the method for the next published release

For the next available version:

1. use the exact 2.1.96 package as the adjacent published baseline;
2. explicitly confirm whether intervening version numbers were published;
3. retain the matching 2.1.88 bundle/map strictly as a source oracle;
4. authenticate both tarballs and inventory every member;
5. regenerate exact-delta, attribution, structural, and readable outputs;
6. express changed metadata as unique exact transformations;
7. preserve every unsupported changed package member with a hash-pinned
   payload recipe;
8. add only target-fragment-backed source patches, leaving unobservable
   module paths explicit;
9. pin pre- and post-overlay full-tree hashes;
10. reverse and forward verify the patch chain; and
11. require the aggregate gate before publishing the recovery.

This keeps each published release independently replayable while preserving
the boundary between exact published-code recovery and partial authored-source
recovery.
