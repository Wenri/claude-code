# 2.1.92 → 2.1.94 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.94 from the verified 2.1.92 base. Upstream did not publish
2.1.93, so this is one step in published-release order even though the patch
number advances by two.

The result has two explicit confidence levels:

1. The published 2.1.94 bundle and npm package tree are recovered exactly.
2. Authored TypeScript is recovered only where the minified target provides
   sufficient evidence. Erased source spelling is not invented.

The exhaustive 1,795-row semantic ledger has zero first-party source-runtime
gaps and pins the recovered Bedrock model-upgrade owners. It still records 189
dependency-runtime gaps plus the absent root manifest/lockfile and hermetic
build recipe. Thus first-party compiled semantics are source-complete, whole-
bundle source reproduction is incomplete, and exact `cli.js` bytes are a
separate generated-delta replay claim.
The canonical semantic supplement is 4,983,928 bytes across 151 `src/`
paths, SHA-256
`c41b3e10567b9870e9b6dfeed737b3169c2c7439b6d18bfbb27b55a9a8009892`.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.92-to-2.1.94
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the next published release

Resolve exact npm versions, never a mutable tag. Verify the skipped version
explicitly:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.93 version --json
```

The exact-version lookup must report that no matching 2.1.93 version exists.
Do not invent an intermediate archive or concatenate two unobserved deltas.
Use 2.1.92 as the adjacent baseline and 2.1.94 as the next published target.

Record for each available tarball:

- registry URL and compressed byte length;
- registry SHA-1 and SHA-512 SRI;
- registry ECDSA signature and key ID; and
- locally computed SHA-256.

The published tarballs are:

```text
2.1.92  17,164,906 bytes
sha256  fff885f916e6b3a71853559601af12abb1b64714cfc2f0635a25613b96749347

2.1.94  18,527,047 bytes
sha256  14a2aa53b5227d165f629bcad120c13fc09728168445c95e95641d62c4b00382
```

Pin the official changelog by commit, not by a moving branch. This case uses
commit `b9fbc7796b80659c570265deee97b0a8fc40bd89`.

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
  --baseline "$RECOVERY_ARTIFACTS/2.1.92/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.92 \
  --target-version 2.1.94 \
  --baseline-shasum 536b5c573ae5d3ba85ace514e2e72d37c3d5e464 \
  --target-shasum ce7eb277e592cfb4d3368af17a7690d39566aebd \
  --baseline-integrity \
    'sha512-mNGw/IK3+1yHsQBeKaNtdTPCrQDkUEuNTJtm3OBTXs4bBkUVdIgRme/34ZnbZkl2VMMYPoNaTvqX2qJZ9EdSxQ==' \
  --target-integrity \
    'sha512-zOHw8NxxXYinL4vNrkdFfTUAri9Jdl2wIAFAmwUJW4M1cTxbhKLHND2VldySIFIpuTtPONyRmHtxU88mLvde9Q==' \
  --baseline-signature \
    'MEUCIA9Pbrb5aRJaP0BIUvY7wPnYuXxf1bmtO2STf8s5CFUrAiEA5Ls/eijn2heuQIP7Mft2b0HcFrhaQgUt61c78t2tvYM=' \
  --target-signature \
    'MEUCIEj1owBPiLzNMHX89FPMiEKFzob7CRPkh1FRNGxrhyyIAiEA7kZ4JLJU0B4Nn3XWyuyv7WYa+PDgGkY8H1bB5XqrM8o=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.92.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.94.tgz'
```

Require:

```text
20 baseline members
20 target members
8 unchanged
12 changed
0 added
0 removed
complete = true
```

Inspect content, type, link target, and mode independently. The complete
non-unchanged set must be:

- changed `package/cli.js`;
- changed `package/package.json`;
- changed Darwin and Windows audio-capture binaries for arm64 and x64; and
- changed Darwin, Linux, and Windows ripgrep binaries for arm64 and x64.

The two signatures must verify under the pinned registry key. The declaration
member must compare byte-identical.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.92 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

The source oracle is:

```text
bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never treat the 2.1.88 map as a direct map for 2.1.92 or 2.1.94.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564
```

The builder reconstructs and byte-compares the target before succeeding.
Expected delta:

```text
bytes   2,021,935
sha256  654793f39daa8d8cdce358999a8f0ebc63811b1c4a233dcfba91c2958fe5ad73
```

## 5. Preserve changed vendor members exactly

Four audio-capture binaries and six ripgrep binaries changed. For each member
listed in [`diff/README.md`](./diff/README.md), generate a deterministic
dictionary patch against the same member from 2.1.92:

```sh
MEMBER='vendor/ripgrep/x64-linux/rg'

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.92/package/$MEMBER" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package/$MEMBER" \
  --output "$RECOVERY_WORK/package/$MEMBER.zstd-delta"
```

Repeat for the exact ten-member set. Require these patch byte lengths:

```text
audio-capture arm64-darwin    138
audio-capture arm64-win32     138
audio-capture x64-darwin       99
audio-capture x64-win32       139
ripgrep arm64-darwin      884,996
ripgrep arm64-linux     1,066,103
ripgrep arm64-win32       989,691
ripgrep x64-darwin        965,440
ripgrep x64-linux       1,410,144
ripgrep x64-win32       1,049,035
```

Record one `generatedRecovery.packageMembers.changedMemberPayloads` recipe
for each member. Every recipe names the exact `package/...` member,
case-relative patch path, and `zstd-dictionary-patch` algorithm.
Reconstruction must fail on missing, duplicate, unused, unsafe, or
non-regular recipes.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.94/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.94/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-b9fbc77.md" \
  --changelog-section 2.1.94
```

Require:

- 4,756 baseline source rows;
- 4,584 target initializer rows;
- 42,859 target partition rows;
- 13,243,887 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked target attribution, not
a claim that an ancestor map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    08158a2006076e86e5cd82699ea627279da6260da002dd6cbc2d3baa371046b5 \
  --expected-bytes 2028409 \
  --expected-baseline-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-tokens 4266602 \
  --expected-target-units 18563
```

Every target token must appear exactly once. Leave unsupported baseline
pairings unresolved instead of guessing. This case classifies 3,879,475
tokens as matched, 14,854 as moved candidates, 59,881 as coarse changed
candidates, and 312,392 as unresolved pairings.

## 8. Generate the readable full-bundle diff

```sh
pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564
```

Require the comparison-invariant target hash to remain unchanged before and
after accepted alpha renames and statement normalization. Preserve rejected
renames in `metadata.json`. The checked-in output includes the complete
compressed normalized diff, a compact statement diff, and a rename ledger.

Expected checked-in output:

```text
metadata.json             3,912 bytes
normalized.diff.gz    5,380,836 bytes
statements.diff         149,723 bytes
renames.tsv             214,503 bytes
```

## 9. Recover package metadata exactly

`sdk-tools.d.ts` is unchanged. For `package.json`, uniquely replace version
`2.1.92` with `2.1.94`. No insertion, deletion, or other metadata rewrite is
required.

`reconstruct-package.mjs` applies the version recipe, restores the target
bundle from the exact delta, reconstructs all ten changed vendor members
from their dictionary patches, and checks every result against the
authenticated target archive.

## 10. Localize source-facing changes

Use all of these together:

1. the 25 pinned official release-note entries;
2. exact target-only and changed literals;
3. source-oracle ownership candidates;
4. adjacent structural pairs and the readable diff;
5. the verified 2.1.92 source tree; and
6. exact target control flow, operators, constants, and call order.

For each source-facing claim, pin a unique target fragment by:

- start delimiter;
- exclusive end delimiter;
- byte length; and
- SHA-256.

This case pins 34 unique target fragments. They cover Mantle/model routing,
effort and retry behavior, plugin and prompt hooks, keychain diagnostics,
Slack rendering, stream-json decoding, resume/SDK/hyperlink behavior,
terminal and transcript repairs, and SDK settings errors. Source placement is
accepted only when the adjacent bundle control flow, literals, source-oracle
ownership, and recovered 2.1.92 modules agree. The two VS Code-only release
notes are not projected into the CLI source tree because the published npm
package contains no extension source and the authenticated CLI comparison
shows no corresponding behavior change.
The manifest must require each fragment to have exactly one recovery
explanation and every recovered file to be hash-pinned and referenced.

Release notes are localization hints, not byte authority. Do not reconstruct
unrelated changelog bullets when the adjacent generated evidence does not
support a defensible authored-source placement. Preserve exact published
runtime bytes in the generated recovery even where authored TypeScript is
unobservable.

If a recovered source file already carries an inline source map, compare its
payload byte-for-byte with the base and preserve it unchanged. The seven such
files in this overlay have zero payload mismatches. Do not regenerate or
rewrite inherited maps when the target release publishes no replacement map.

## 11. Apply the defensible source overlay

On the verified 2.1.92 tree, apply:

```sh
git apply "$CASE/recovered/mantle-provider-and-models.patch"
git apply "$CASE/recovered/effort-and-retry.patch"
git apply "$CASE/recovered/plugin-and-prompt-hooks.patch"
git apply "$CASE/recovered/keychain-diagnostics.patch"
git apply "$CASE/recovered/slack-send-header.patch"
git apply "$CASE/recovered/stream-json-utf8.patch"
git apply "$CASE/recovered/resume-sdk-and-hyperlinks.patch"
git apply "$CASE/recovered/terminal-and-transcript-rendering.patch"
git apply "$CASE/recovered/sdk-settings-validation.patch"
```

The overlay is already applied in this repository. Do not apply it twice.
The lineage verifier reverse-checks and reapplies it in a temporary copy.

The nine patches recover Mantle and corrected Bedrock routing; effort and
bounded retry behavior; plugin metadata, roots, skills and hooks; prompt
session titles; keychain diagnostics; Slack rendering; UTF-8 stream-json
boundaries; cross-worktree resume, SDK abort persistence and forced
hyperlinks; terminal/transcript scrolling, layout and cursor repairs; and SDK
settings-validation errors. They modify 43 existing paths and add
`src/services/mcp/slackToolRendering.tsx`. No paths are deleted or renamed.

## 12. Pin and verify the source lineage

Tree hashes frame records sorted by path as:

```text
src/path\0bytes\0sha256\n
```

The exact base is:

```text
commit       696930f29337e98869337eb59f55ead81f242abb
Git tree     79176683a041a4e38ff2a4b35367645ff60f2e9d
Git src tree b8bf1b0eff48f8abb01c0fd955af3d1e36dd9569
files        1,930
bytes        30,672,193
framed hash  18f5471774fe00053622904e4fa157592d1c887b6b7bed32fe9528b62ca0e42e
```

The recovered target is:

```text
files        1,931
bytes        30,686,905
framed hash  f24db0beefa396a41d5a37101ef6089df6ab185d1813b7e75663854202a10892
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
2. reverse-applies the patches in reverse order;
3. proves the exact 2.1.92 base tree;
4. reapplies the patches in order;
5. byte-compares the reconstructed target with the repository;
6. Bun-builds all 44 changed or added TypeScript paths; and
7. runs four target-backed test files containing 13 semantic tests.

Expected status is `source-lineage-verified`.

## 13. Reconstruct the complete package tree

Create a non-existent output path:

```sh
RECOVERED_PARENT=$(mktemp -d)

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.92/package.tgz" \
  --output "$RECOVERED_PARENT/package"
```

The reconstructor must:

- copy all eight byte-identical members with their target modes;
- reconstruct `cli.js` from the exact delta;
- replace the package version;
- reconstruct all ten changed vendor executables from dictionary patches;
- reject undeclared or unused changed-member recipes;
- compare every output member with the authenticated target archive; and
- verify the framed target-tree hash.

Expected result:

```text
status             exact-package-tree-reconstructed
members            20
bytes              48,924,688
framed tree sha256 bf795adc3f8d22228c0eb81c38f0049b1dfa9f71ef93a23f9a0e5ab1d7737c89
```

## 14. Close the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.92/package.tgz"
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
- the exact 20-member package tree, including all ten changed vendor
  executables.

Expected status:

```text
complete-recovery-verified
```

## 15. Run focused regression tests

The target-specific test files are:

- `recovery/test/recovery-2.1.94-core-overlay.test.mjs`
- `recovery/test/recovery-2.1.94-scroll-repair.test.mjs`
- `recovery/test/recovery-2.1.94-sdk-settings.test.mjs`
- `recovery/test/recovery-2.1.94-terminal-ui.test.mjs`

Supply the adjacent authenticated bundles through:

```sh
CLAUDE_CODE_2_1_92_BUNDLE="$RECOVERY_ARTIFACTS/2.1.92/package/cli.js" \
CLAUDE_CODE_2_1_94_BUNDLE="$RECOVERY_ARTIFACTS/2.1.94/package/cli.js" \
pixi run node --test \
  recovery/test/reconstruct-package.test.mjs \
  recovery/test/recovery-2.1.94-core-overlay.test.mjs \
  recovery/test/recovery-2.1.94-scroll-repair.test.mjs \
  recovery/test/recovery-2.1.94-sdk-settings.test.mjs \
  recovery/test/recovery-2.1.94-terminal-ui.test.mjs
```

This focused command passes 29 tests: 16 package-reconstructor tests and 13
2.1.94 semantic tests. The full recovery suite also includes prior-release
tests. Supply its pinned 2.1.89, 2.1.90, and 2.1.91 bundles in the
corresponding environment variables, then run:

```sh
pixi run npm --prefix recovery test
```

The complete checked-in suite passes 102 tests.

## 16. Reuse the method for the next published release

For the next available version:

1. use the current exact target package as the adjacent published baseline;
2. explicitly confirm whether intervening version numbers were published;
3. retain the newest matching mapped ancestor strictly as a source oracle;
4. authenticate both tarballs and inventory every member;
5. regenerate exact-delta, attribution, structural, and readable outputs;
6. express changed metadata as unique exact transformations;
7. preserve every otherwise unsupported changed or target-only regular
   member as a hash-pinned payload recipe;
8. add only target-fragment-backed source patches or explicitly scoped
   models;
9. pin pre- and post-overlay full-tree hashes;
10. reverse and forward verify the patch chain; and
11. require the aggregate gate before publishing the recovery.

This keeps each published release independently replayable while preserving
the essential boundary: exact published-code recovery can coexist with
partial authored-source recovery.
