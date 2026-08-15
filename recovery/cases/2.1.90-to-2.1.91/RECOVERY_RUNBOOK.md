# 2.1.90 → 2.1.91 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.91 from the verified 2.1.90 base.

The result has two explicit confidence levels:

1. The published 2.1.91 bundle and npm package tree are recovered exactly.
2. Authored TypeScript is recovered only where the minified target provides
   sufficient evidence. Erased source spelling is not invented.

Keep two additional verdicts separate. The exhaustive 3,113-row semantic
ledger has zero first-party source-runtime gaps, but it retains 153 unpinned
dependency-runtime gaps and records the missing manifest/lockfile/hermetic
build recipe. Therefore first-party compiled semantics are source-complete,
while whole-bundle source reproduction is not. Exact bundle bytes are replayed
independently from the generated delta.
The canonical semantic supplement is 5,617,466 bytes across 118 `src/`
paths, SHA-256
`8db899a471f6d4bc7c8ff22c42211643e725a29d7bfb484c3713def00086498b`.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.90-to-2.1.91
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
2.1.90  16,512,072 bytes
sha256  8e49c90ebaec565b5fb0af744bebc53c1fd36262453cb4f309c12f6127b55418

2.1.91  16,522,495 bytes
sha256  4fb4dae771d6fad1e74703741148f5ee2d24837f4a04eab27041746f7a5b3e2b
```

Pin the official changelog by commit, not by a moving branch. This case uses
commit `1e03cc7fc40d9bab33f24855a8b5d31ba66205cb`.

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
  --baseline "$RECOVERY_ARTIFACTS/2.1.90/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.91/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.90 \
  --target-version 2.1.91 \
  --baseline-shasum b086e61c497edae02fb5bf52fae75293c034138a \
  --target-shasum f7c6050592b4a7c10074eacda07872f79875dc61 \
  --baseline-integrity \
    'sha512-orm8uULh71ow5yA27PXMGYZrNlEAUmmGOwPrOava6wuai1wAC7J7ZOvx2cbM2u8GJBDkdiNSFdUwYmzc6QsWDQ==' \
  --target-integrity \
    'sha512-RvSjgk4yKfwjByUK+r6LXHU0aXLse0omlWhBefiFJhCyNAB8sc3NHc3N7+7CPaBLC/s3MHf3AQHSYqi6V8ltuA==' \
  --baseline-signature \
    'MEQCIFqEht1VJg6BcBhwH8KmK7QgiENfHVW2a/DtRIFj8A2MAiBnOjQlz/gCtiw+GlyesG51y76uOUFaEJNo7llzHl4JYg==' \
  --target-signature \
    'MEUCIQCQubDdTodhmZh056FJOdAiUYNEWqq9qygWlJUAhdBp8AIgKXp4FeChs8AK+zrjgED2LflP2OS13NG/ivBCIK9N2p8=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.90.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.91.tgz'
```

Require:

```text
19 baseline members
18 target members
15 unchanged
3 changed
0 added
1 removed
complete = true
```

Inspect content, type, link target, and mode independently. The complete
non-unchanged set must be:

- changed `package/cli.js`;
- changed `package/package.json`;
- changed `package/sdk-tools.d.ts`; and
- removed `package/bun.lock`.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.90 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

The source oracle is:

```text
bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never treat the 2.1.88 map as a direct map for 2.1.90 or 2.1.91.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.90/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816
```

The builder reconstructs and byte-compares the target before succeeding.
Expected delta:

```text
bytes   1,934,216
sha256  2039573574ae6167b61b030212587cd842b698ccb91cec3cce2eba1988b7ee57
```

## 5. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.91/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.91/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-1e03cc7.md" \
  --changelog-section 2.1.91
```

Require:

- 4,756 baseline source rows;
- 4,559 target initializer rows;
- 43,354 target partition rows;
- 13,098,272 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked target attribution, not
a claim that an ancestor map directly maps the target.

## 6. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.90/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    9962b898f24659034aeec2fd8c2f6b3bafe40eaf463f0290e955f3ff3ce7070c \
  --expected-bytes 2054684 \
  --expected-baseline-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-tokens 4222365 \
  --expected-target-units 18329
```

Every target token must appear exactly once. Leave unsupported baseline
pairings unresolved instead of guessing.

## 7. Generate the readable full-bundle diff

```sh
pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.90/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816
```

Require the comparison-invariant target hash to remain unchanged before and
after accepted alpha renames and statement normalization. Preserve rejected
renames in `metadata.json`.

## 8. Recover package metadata and declarations exactly

Compare the adjacent text files byte-for-byte. The target declaration is the
baseline declaration with one unique insertion:

```text
anchor  "mode?: \"acceptEdits\" | "
text    "\"auto\" | "
```

The target `package.json` is the exact version replacement followed by one
unique insertion after the optional-dependency object:

```json
"files": [
  "cli.js",
  "sdk-tools.d.ts",
  "vendor/ripgrep/",
  "vendor/audio-capture/"
]
```

`exact-text-insertion.mjs` rejects missing or duplicate anchors.
`reconstruct-package.mjs` applies both recipes and checks the resulting bytes
against the authenticated target members. Focused unit tests also prove that
malformed anchors fail and earlier cases retain their old behavior.

## 9. Localize source-facing changes

Use all of these together:

1. the 13 pinned official release-note entries;
2. exact target-only and changed literals;
3. source-oracle ownership candidates;
4. adjacent structural pairs and the readable diff;
5. the verified 2.1.90 source tree; and
6. exact target control flow, operators, constants, and call order.

For each source-facing claim, pin a unique target fragment by:

- start delimiter;
- exclusive end delimiter;
- byte length; and
- SHA-256.

This case pins 18 fragments. The manifest requires each fragment to have
exactly one recovery explanation and every recovered file to be hash-pinned
and referenced.

Do not force application ownership onto dependency output. The Bun
`stripANSI` optimization is kept as an exact executable model. Do not create a
speculative remote-plan patch: the repository's plan lookup already matches
the target-observed implementation and its adjacent compiled call sites are
unchanged.

## 10. Apply the defensible source overlay

On the verified 2.1.90 tree, apply:

```sh
git apply "$CASE/recovered/mcp-result-override.patch"
git apply "$CASE/recovered/skill-shell-policy.patch"
git apply "$CASE/recovered/multiline-deep-links.patch"
git apply "$CASE/recovered/plugin-bin-path.patch"
git apply "$CASE/recovered/transcript-chain-fallback.patch"
git apply "$CASE/recovered/input-permission-schema.patch"
git apply "$CASE/recovered/feedback-availability.patch"
git apply "$CASE/recovered/windows-rollback-cleanup.patch"
git apply "$CASE/recovered/edit-anchor-guidance.patch"
git apply "$CASE/recovered/claude-api-guidance.patch"
```

The overlay is already applied in this repository. Do not apply it twice.
The lineage verifier reverse-checks and reapplies it in a temporary copy.

The `/claude-api` patch adds 27 Markdown files whose bytes are decoded from
exact target string literals. Other source edits are behaviorally equivalent;
names and formatting erased by minification remain explicitly inferred.

## 11. Pin and verify the source lineage

Tree hashes frame records sorted by path as:

```text
src/path\0bytes\0sha256\n
```

The exact base is:

```text
commit       2ba94f2c67c645119e4f33ee9a68e7e14449c238
Git tree     8700b3ed86296df96e72a765107097b401a3bdd7
Git src tree a5bc0fdaa01f4ddc02ee253ead2d0cc39efc2572
files        1,903
bytes        30,392,826
framed hash  9be3f19a65aa46760fd3ababffefe74cc6eb1f81cb12b57bfb5e16662425ce25
```

The recovered target is:

```text
files        1,930
bytes        30,661,962
framed hash  5a74a719338766ab26023fc4041013bce9ff968356d152cb7df725bdab8a4108
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
2. reverse-applies the ten patches in reverse order;
3. proves the exact 2.1.90 base tree;
4. reapplies the patches in order;
5. byte-compares the reconstructed target with the repository;
6. Bun-builds all 21 changed TypeScript files; and
7. runs 12 target-backed semantic tests.

Expected status is `source-lineage-verified`.

## 12. Reconstruct the complete package tree

Create a non-existent output path:

```sh
RECOVERED_PARENT=$(mktemp -d)

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.90/package.tgz" \
  --output "$RECOVERED_PARENT/package"
```

The reconstructor must:

- copy all byte-identical members with their target modes;
- reconstruct `cli.js` from the exact delta;
- apply the exact declaration insertion;
- apply the exact package version and whitelist insertion;
- omit the removed `bun.lock`;
- compare every output member with the authenticated target archive; and
- verify the framed target-tree hash.

Expected result:

```text
status             exact-package-tree-reconstructed
members            18
bytes              43,103,342
framed tree sha256 21a9edcea0cb4bb2ae36348c39f9e08c836e3476e96ae6f3d8a34c1a7aa35585
```

## 13. Close the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.90/package.tgz"
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
- the exact 18-member package tree.

Expected status:

```text
complete-recovery-verified
```

## 14. Reuse the method for the next release

For 2.1.92 or later:

1. use the current exact target package as the adjacent baseline;
2. retain the newest matching mapped ancestor strictly as a source oracle;
3. authenticate both tarballs and inventory every member;
4. regenerate exact-delta, attribution, structural, and readable outputs;
5. express non-bundle member changes as unique exact transformations;
6. add only target-fragment-backed source patches or explicitly scoped models;
7. pin pre- and post-overlay full-tree hashes;
8. reverse and forward verify the patch chain; and
9. require the aggregate gate before publishing the recovery.

This keeps each release independently replayable while preserving the
essential boundary: exact published-code recovery can coexist with partial
authored-source recovery.
