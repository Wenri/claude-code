# 2.1.89 → 2.1.90 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.90 from the verified 2.1.89 base.

The result is generated/package-complete and authored-source-partial:

1. The published 2.1.90 bundle and npm package tree are recovered exactly.
2. Authored TypeScript is recovered only where the minified target provides
   enough evidence. Erased source spelling is not invented.

The checked semantic ledger makes a separate runtime claim: all 2,109
nonmatched structural units are classified, every reachable first-party
runtime change has an equivalent historical/current source owner, and there
are zero first-party source gaps. It deliberately leaves 223 dependency
runtime/build-input gaps, so it does not claim that `src/` alone can compile
the whole bundle. Exact `cli.js` bytes come only from the generated delta.
The canonical semantic supplement is 5,013,030 bytes across 115 `src/`
paths, SHA-256
`29541c49fa45d5cf8dd11acb87217e3d5548b61efe59df86670c9a5c6895e6ca`.

## 0. Prepare the recovery environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.89-to-2.1.90
ARTIFACTS=$(mktemp -d)
WORK=$(mktemp -d)
```

The checked environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Freeze the adjacent releases

Resolve each exact npm version, never a mutable tag such as `latest`. Record:

- tarball URL;
- compressed byte length;
- npm SHA-1 and SHA-512 SRI;
- registry ECDSA signature and key ID; and
- SHA-256 computed from the downloaded bytes.

The pinned adjacent tarballs are:

```text
2.1.89  16,493,038 bytes
sha256  680e35001b24b604f58958e3a324bb758be3c069c0a3f89585156256f17a9c87

2.1.90  16,512,072 bytes
sha256  8e49c90ebaec565b5fb0af744bebc53c1fd36262453cb4f309c12f6127b55418
```

Download and verify all manifest artifacts:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$ARTIFACTS"
```

The acquisition step also extracts and verifies the archive members used by
later commands.

## 2. Authenticate and compare every package member

Use `compare-npm-tarballs.mjs` with the pinned registry metadata:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$ARTIFACTS/2.1.89/package.tgz" \
  --target "$ARTIFACTS/2.1.90/package.tgz" \
  --output "$WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.89 \
  --target-version 2.1.90 \
  --baseline-shasum f2cb6b8b589a0d4f8a2b83a3920812a747336cf8 \
  --target-shasum b086e61c497edae02fb5bf52fae75293c034138a \
  --baseline-integrity \
    'sha512-etjihHqVxj1RjS5Zu/o+rv3ojn1N7AWzfgIOCSSSncfyb4qJn9J677scj0LHIxtwzjgU7j1qAedXlXKxgkFG2w==' \
  --target-integrity \
    'sha512-orm8uULh71ow5yA27PXMGYZrNlEAUmmGOwPrOava6wuai1wAC7J7ZOvx2cbM2u8GJBDkdiNSFdUwYmzc6QsWDQ==' \
  --baseline-signature \
    'MEQCIGE+C8+9YI/pUb190BmNwyXJoCVGOag9G1Y3vLZw2US4AiBS5g+q78qYJmLaQTdAG1Jrz2RfjHAuifZHgchG6+ESCg==' \
  --target-signature \
    'MEQCIFqEht1VJg6BcBhwH8KmK7QgiENfHVW2a/DtRIFj8A2MAiBnOjQlz/gCtiw+GlyesG51y76uOUFaEJNo7llzHl4JYg==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g=='
```

Require the report to say:

```text
19 baseline members
19 target members
13 unchanged
6 changed
0 added
0 removed
complete = true
```

Inspect content, type, link target, and mode separately. This is what reveals
that four “changed” ripgrep files are byte-identical mode changes from `0644`
to `0755`, while `sdk-tools.d.ts` is entirely unchanged.

## 3. Assign the two baseline roles

Do not conflate adjacency with source ownership:

- exact adjacent comparisons use 2.1.89 `cli.js`;
- source ownership uses the matching 2.1.88 `cli.js` and `cli.js.map`.

The source oracle is pinned at:

```text
bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

The 2.1.88 map must never be presented as a direct map of either the 2.1.89
or 2.1.90 bundle.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$ARTIFACTS/2.1.89/package/cli.js" \
  --target "$ARTIFACTS/2.1.90/package/cli.js" \
  --output "$WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9
```

The command reconstructs and byte-compares the target before succeeding.
Expected delta:

```text
bytes   1,985,545
sha256  a9f3e0b9fc736ae1129cc4e8ffcd82c9327e08f8d91be8e7cd3ca46540b7089e
```

## 5. Build exhaustive source attribution

Run the mapped-ancestor comparison:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --map "$ARTIFACTS/2.1.88/cli.js.map" \
  --target "$ARTIFACTS/2.1.90/package/cli.js" \
  --output "$WORK/attribution" \
  --target-package-json "$ARTIFACTS/2.1.90/package/package.json" \
  --target-dts "$ARTIFACTS/2.1.90/package/sdk-tools.d.ts" \
  --changelog "$ARTIFACTS/evidence/claude-code-CHANGELOG-a50a919.md" \
  --changelog-section 2.1.90
```

Require:

- 4,756 baseline source rows;
- 4,552 target initializer rows;
- 43,530 target partition rows;
- 13,064,141 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

The output separates exact baseline ownership from candidate target
attribution.

## 6. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$ARTIFACTS/2.1.89/package/cli.js" \
  --target "$ARTIFACTS/2.1.90/package/cli.js" \
  --output "$WORK/generated-delta.json.gz"
```

Verify:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$WORK/generated-delta.json.gz" \
  --expected-sha256 \
    7cd29e61b5ca2bb8209a990c1d7702cc6c42b9810a11815c117309cf55cf84a2 \
  --expected-bytes 1998098 \
  --expected-baseline-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-tokens 4213780 \
  --expected-target-units 18275
```

Every token must be represented once. Do not force unresolved candidates
into invented pairings.

## 7. Generate the readable full-bundle diff

```sh
pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$ARTIFACTS/2.1.89/package/cli.js" \
  --target "$ARTIFACTS/2.1.90/package/cli.js" \
  --output "$WORK/readable-diff" \
  --expected-baseline-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9
```

The generator must prove its target comparison-invariant hash before and
after accepted alpha renames and statement normalization. Preserve rejected
renames in the metadata; ambiguity is evidence, not a reason to guess.

## 8. Localize source-facing candidates

Use all of the following together:

1. official release notes;
2. target-only and changed exact literals;
3. source-oracle ownership candidates;
4. adjacent structural pairs;
5. verified pre-overlay 2.1.89 base context; and
6. exact target control flow, operators, constants, and call order.

For every recovered source edit, pin a unique target fragment with:

- start delimiter;
- exclusive end delimiter;
- byte length; and
- SHA-256.

This case pins 13 fragments. The manifest requires every fragment to have
exactly one source-facing explanation.

## 9. Apply only defensible source edits

The incremental patch order is:

```sh
git apply "$CASE/recovered/safety-and-cache.patch"
git apply "$CASE/recovered/sse-stream-buffering.patch"
git apply "$CASE/recovered/session-resume.patch"
git apply "$CASE/recovered/query-engine-transcript.patch"
git apply "$CASE/recovered/rate-limit-options.patch"
git apply "$CASE/recovered/help-powerup-hint.patch"
```

After applying the patches, the working tree contains the overlay. To prove
that state without trying to apply it twice, use the verifier in step 10 or
reverse-check each patch.

Source confidence is `equivalent`, not exact authored spelling. In
particular, keep the existing `General.tsx` inline source-map payload:
2.1.90 supplies no replacement map, so regenerated mappings would be
fabricated.

## 10. Pin the incremental source lineage

Compute the deterministic tree hash over records sorted by path:

```text
src/path\0bytes\0sha256\n
```

The recovered 2.1.89 base is pinned by:

```text
commit       ae5a27f9446042e9df589189889c110703ab351c
Git tree     46958b696b39b12fca05d9483c1e65916b5a78b1
Git src tree 55f942c4be314b91e0230a034750717d7bb8132f
files        1,903
bytes        30,388,323
framed hash  b1724f0656a658c9113c06e5f7ebf94a2d97161c104fa6c59e0c962ddd5434d3
```

The recovered 2.1.90 overlay tree is:

```text
files        1,903
bytes        30,392,826
framed hash  9be3f19a65aa46760fd3ababffefe74cc6eb1f81cb12b57bfb5e16662425ce25
```

Verify both directions:

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$ARTIFACTS"
```

The verifier:

1. hashes the repository target tree;
2. copies it to a temporary workspace;
3. reverse-applies patches in reverse order;
4. checks the exact base tree;
5. reapplies patches in forward order;
6. byte-compares the reconstructed target with the repository;
7. Bun-builds all changed files; and
8. runs 20 focused lineage tests: 15 for the 2.1.90 increment and five
   inherited 2.1.89 Bash regressions.

Expected status is `source-lineage-verified`.

## 11. Reconstruct the complete package tree

```sh
OUTPUT=$(mktemp -d)
rmdir "$OUTPUT"

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$ARTIFACTS/2.1.89/package.tgz" \
  --output "$OUTPUT"
```

The reconstructor must:

- copy byte-identical members;
- apply target file modes, including the four ripgrep mode changes;
- change only the package version;
- leave declarations unchanged;
- recover `cli.js` from the exact delta; and
- byte-compare every output member with the target tarball.

Expected result:

```text
status             exact-package-tree-reconstructed
members            19
bytes              43,069,612
framed tree sha256 23d1ac51403cbc1046cf7519d85c9a025f89f05bdeb447dbdaa65d5cf14fe45c
```

## 12. Close the aggregate gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$ARTIFACTS/2.1.89/package.tgz"
```

This single command verifies:

- every external artifact;
- source-oracle topology and repository overlay hashes;
- all target fragments and recovery-file assertions;
- bidirectional incremental source lineage;
- exact bundle reconstruction;
- exhaustive attribution;
- complete structural token accounting;
- readable-diff invariants;
- focused recovery tests; and
- the exact 19-member package tree.

Expected status:

```text
complete-recovery-verified
```

## 13. Reuse the method for the next release

For 2.1.91 or later:

1. use the current exact target bundle/package as the new adjacent baseline;
2. retain the newest matching mapped ancestor strictly as a source oracle;
3. regenerate package, exact-delta, structural, attribution, and readable
   outputs from pinned artifacts;
4. add only target-fragment-backed incremental source patches;
5. pin pre- and post-overlay full-tree hashes;
6. reverse then forward verify the patch chain; and
7. require the aggregate gate before publishing.

This makes each release step independently replayable while keeping the
central confidence boundary explicit: exact published code can coexist with
partial authored-source recovery.
