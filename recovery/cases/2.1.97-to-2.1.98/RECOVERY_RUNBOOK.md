# 2.1.97 → 2.1.98 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.98 from the verified 2.1.97 base.

The result has two explicit confidence levels:

1. The published 2.1.98 bundle, declarations, and npm package tree are
   recovered exactly.
2. Authored TypeScript is recovered only where the generated target provides
   sufficient placement evidence. Erased spelling and module boundaries are
   not invented.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.97-to-2.1.98
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the adjacent published release

Resolve exact versions, never a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.97 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.98 version dist --json
```

Confirm from the registry packument that no published version falls between
them. Pin the official lightweight `v2.1.98` tag at
`c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917` and pin the changelog at that
commit.

```text
2.1.97 tarball bytes  18,546,637
sha256                 59df8e883edd0925bcb73407f974d0138c39106b744b8e6453ff23e3154b9a8a

2.1.98 tarball bytes  18,574,200
sha256                 a536437ce8a79c1908bc73a197fa9c86497fa2757121a6f6236cd439228c0b7b
published               2026-04-09T18:08:49.739Z
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
  --baseline "$RECOVERY_ARTIFACTS/2.1.97/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.98/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.97 \
  --target-version 2.1.98 \
  --baseline-shasum b790d417b4f47b897068ffff9b57812ccc81e707 \
  --target-shasum 6c4810194686b9a0288e78b9a9a3a64916978f71 \
  --baseline-integrity \
    'sha512-8lKM/rFctBl+82bQ+0g0Lkbt9tJU/zYKAjWisNUq436/386n/VZQbnyjnibGkyqqB6mrX/3ub/cpFlpCu4FXLg==' \
  --target-integrity \
    'sha512-qecREauMWXHplkpjqsuDuUv4ww+NprMl71k9sMuLkZU7qwjLMkTPxRBjuKvZWWMrAPvZWdGZE9LljUTfCQ1lWQ==' \
  --baseline-signature \
    'MEUCICG6rML8JBFMxvrHFFDhofBztC5mvsOLqHbO7G4bdU4MAiEA/TuR+/HzSBvE2e/5XokcLHWOLaw604eahZ4Hy+IFTew=' \
  --target-signature \
    'MEQCIGvolW/eLJuocfuN94cinl0Vz9arMrshmIhulXk/9JEBAiAW18CskQ+uEkWf90x4Dc0TqDoRBQ7lmCAXhpXpqbEJDA==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.97.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.98.tgz'
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
`package/package.json`. Both signatures must verify under the pinned registry
key.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.97 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

```text
source-oracle bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
source-oracle map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never apply the 2.1.88 map directly to 2.1.97 or 2.1.98 offsets.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556
```

The builder reconstructs and byte-compares the target before succeeding.

```text
delta bytes   2,383,732
delta sha256  12ec0a9f269c9fe3b6653ef06887dcfb5d8bd56503201ed0994beb0bf0d4a7f3
```

## 5. Prove metadata and declarations

Diff the adjacent public declarations directly:

```sh
cmp \
  "$RECOVERY_ARTIFACTS/2.1.97/package/sdk-tools.d.ts" \
  "$RECOVERY_ARTIFACTS/2.1.98/package/sdk-tools.d.ts"
```

They must be byte-identical. Encode this in
`targetAssertions.declarationChange` as `{ "kind": "unchanged" }`. Both files
are 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.

The only `package.json` change must be the unique version replacement
2.1.97 → 2.1.98. Do not create a declaration delta or claim an API change.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.98/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.98/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-c5600e0b.md" \
  --changelog-section 2.1.98
```

Require:

- 4,756 baseline source rows;
- 4,604 target initializer rows;
- 39,998 target partition rows;
- 13,405,677 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked attribution, not a claim
that an ancestor map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    fba26dec12b3cfd7da8e0f938060ad070a976a26ddedc0bcb2f9a11972ca53dd \
  --expected-bytes 2081527 \
  --expected-baseline-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-tokens 4290788 \
  --expected-target-units 18748
```

Every target token must appear exactly once. This case classifies 3,790,364
as matched, 6,498 as moved candidates, 68,270 as coarse changed candidates,
and 425,656 as explicitly unresolved.

## 8. Generate the readable full-bundle diff

On an 8 GiB host, use a 6 GiB old-space limit and do not run this concurrently
with attribution:

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.97/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556
```

Heap size does not affect canonical output. Require the target
comparison-invariant hash to remain unchanged before and after accepted
alpha renames and statement normalization.

## 9. Localize only defensible source edits

Use the adjacent structural/readable comparison as the authority. The 2.1.88
map is useful for baseline ownership but cannot prove target module names.

For each source-facing edit:

1. identify a target-only or changed generated fragment;
2. prove its adjacent baseline state;
3. map it to an existing source owner only when responsibility and call
   position are unambiguous;
4. preserve target literals, operators, ordering, and error codes;
5. label inferred TypeScript names as equivalent rather than exact; and
6. bind the edit to a unique, hash-pinned target fragment and a focused test.

Keep large target-only modules such as the Vertex setup wizard, Monitor tool,
and subprocess sandbox exact in the published-code layer unless their erased
authored boundaries can be defended. Do not turn changelog prose into invented
source.

Generate one reversible patch over the incremental `src/` changes:

```sh
git diff --binary -- src > \
  "$CASE/recovered/perforce-permissions-and-runtime.patch"
git apply --check --reverse \
  "$CASE/recovered/perforce-permissions-and-runtime.patch"
```

The case's source-lineage verifier reverse-applies the patch to a temporary
copy, checks the complete 2.1.97 source-tree digest, reapplies it, byte-compares
the complete result with the repository, syntax-builds every changed path, and
runs the target-backed tests.

## 10. Close every verification gate

Acquire fresh immutable evidence, then run:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.97/package.tgz"
```

The expected top-level result is `complete-recovery-verified`. The gate
verifies artifact identity, package authentication, exact bundle replay,
unchanged declarations, exhaustive package reconstruction, attribution
coverage, structural accounting, readable-diff invariants, source lineage,
syntax, and target-backed tests.

The exact output identities are:

```text
2.1.98 cli.js SHA-256
27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556

2.1.98 framed package tree SHA-256
850b956fe51eb41bb07b0a3fcc59b1c18cf3aa7cb06bab6961d0d290c096c8f0
```
