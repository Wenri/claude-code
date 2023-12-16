# 2.1.98 → 2.1.100 recovery runbook

This is the reproducible construction and replay procedure used to recover
Claude Code 2.1.100 from the verified 2.1.98 base. Upstream did not publish
2.1.99, so this is one step in published-release order even though the patch
number advances by two.

The result has two explicit confidence levels:

1. The published 2.1.100 bundle, declarations, and npm package tree are
   recovered exactly.
2. Authored TypeScript is recovered only where the generated target provides
   sufficient placement evidence. Erased spelling and module boundaries are
   not invented.

## 0. Prepare the environment

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.98-to-2.1.100
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The pinned environment supplies Node.js, Bun, Zstandard 1.5.7, Acorn, and
eslint-scope.

## 1. Establish the next published release

Resolve exact npm versions, never a mutable tag. Verify the skipped version
explicitly:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.98 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.99 version --json
pixi run npm view @anthropic-ai/claude-code@2.1.100 version dist --json
```

The middle command must report that no matching 2.1.99 version exists. The
registry packument must likewise contain no 2.1.99 key in either `versions`
or `time`, and the exact registry endpoint must return HTTP 404 with
`version not found: 2.1.99`.

```text
2.1.98   published 2026-04-09T18:08:49.739Z
2.1.99   not published by upstream
2.1.100  published 2026-04-10T05:00:41.623Z
```

Do not invent an intermediate archive or concatenate two unobserved deltas.
Use 2.1.98 as the adjacent baseline and 2.1.100 as the next published target.

Cross-check the official lightweight tags independently:

```sh
git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.98 \
  refs/tags/v2.1.99 \
  refs/tags/v2.1.100
```

The only two returned refs are `v2.1.98` and `v2.1.100`, and both resolve to:

```text
c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917
```

The changelog pinned at that commit has no 2.1.100 section. Keep it as
immutable provenance, but do not pass it to target attribution and do not use
its 2.1.98 notes as evidence for 2.1.100 behavior.

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
  --baseline "$RECOVERY_ARTIFACTS/2.1.98/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.100/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.98 \
  --target-version 2.1.100 \
  --baseline-shasum 6c4810194686b9a0288e78b9a9a3a64916978f71 \
  --target-shasum 76b95d381909776db544099e4f75b61c85ee9746 \
  --baseline-integrity \
    'sha512-qecREauMWXHplkpjqsuDuUv4ww+NprMl71k9sMuLkZU7qwjLMkTPxRBjuKvZWWMrAPvZWdGZE9LljUTfCQ1lWQ==' \
  --target-integrity \
    'sha512-bt6unBToiPZqDfMLIKCk8i3CHJqKYnGNHQ2iYt0VKX0Zxoa0g6WOdLM9mw8XGpYSMUaaovUIzdLbJ9XKeng4cQ==' \
  --baseline-signature \
    'MEQCIGvolW/eLJuocfuN94cinl0Vz9arMrshmIhulXk/9JEBAiAW18CskQ+uEkWf90x4Dc0TqDoRBQ7lmCAXhpXpqbEJDA==' \
  --target-signature \
    'MEYCIQC9lUx0f9sUbdqaDxiz5q/A0Qf9pSD877Ze1wOFBxmgnAIhANhm8H94XwcjQVaoI6SlqoQbM+Wp5bxtsH3Tekn4ikuC' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.98.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.100.tgz'
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
key. Paths, types, link targets, modes, sizes, and hashes are checked
independently.

## 3. Keep adjacency and source ownership separate

Use:

- 2.1.98 `cli.js` for exact adjacent comparison; and
- the matching 2.1.88 `cli.js` plus `cli.js.map` only for source ownership.

```text
source-oracle bundle sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
source-oracle map sha256     7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Never apply the 2.1.88 map directly to 2.1.98 or 2.1.100 offsets.

## 4. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be
```

The builder reconstructs and byte-compares the target before succeeding.

```text
delta bytes   1,471,024
delta sha256  17a70bec81bb61a95ff9b3ec1fd211dbd4c1d280f25c04c296aebe600a5a3f84
```

## 5. Prove metadata and declarations

Diff the adjacent public declarations directly:

```sh
cmp \
  "$RECOVERY_ARTIFACTS/2.1.98/package/sdk-tools.d.ts" \
  "$RECOVERY_ARTIFACTS/2.1.100/package/sdk-tools.d.ts"
```

They must be byte-identical. Encode this in
`targetAssertions.declarationChange` as `{ "kind": "unchanged" }`. Both files
are 117,378 bytes with SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.

The only `package.json` change must be the unique version replacement
2.1.98 → 2.1.100. Do not create a declaration delta or claim an API change.

## 6. Build exhaustive source attribution

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.100/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.100/package/sdk-tools.d.ts"
```

Do not add `--changelog` for this case. The commit-pinned file has no
2.1.100 section and is not target release evidence.

Require:

- 4,756 baseline source rows;
- 4,604 target initializer rows;
- 39,997 target partition rows;
- 13,403,094 accounted target UTF-16 units; and
- zero unaccounted target UTF-16 units.

This is exact offset accounting with evidence-ranked attribution, not a claim
that an ancestor map directly maps the target.

## 7. Build the complete structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    ed5c1ee6c5d2566af0f0ff06dd8dfe87259cef1777cd64627ae97ae21def5205 \
  --expected-bytes 1908604 \
  --expected-baseline-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-tokens 4290969 \
  --expected-target-units 18747
```

Every target token must appear exactly once. This case classifies 4,192,305
as matched and 98,664 as explicitly unresolved; there are no moved or coarse
changed candidates. `unresolved` does not mean missing: the tokens remain in
the exact target and complete readable comparison.

## 8. Generate the readable full-bundle diff

On an 8 GiB host, use a 6 GiB old-space limit and do not run this concurrently
with attribution:

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be
```

Heap size does not affect canonical output. Require the target
comparison-invariant hash
`587874eb3fd75623921c85b77169d20a34de55587d148e9eb04596191de6b2db`
before alpha rename, after rename, and after statement normalization.

The canonical compressed full diff is 5,295,677 bytes with SHA-256:

```text
154c1c91b711a085edc456ea1116410259ebba6f1a8fa8dee8e8cb6b3b071180
```

## 9. Localize only defensible source edits

Use the adjacent structural/readable comparison as the authority. The 2.1.88
map provides baseline ownership but cannot prove target TypeScript names or
module boundaries.

The source-facing overlay has exactly three owners:

1. In `src/screens/REPL.tsx`, add thinking milestones at 30, 90, and 270
   seconds, activate them only while loading in thinking mode, clear their
   timers on cleanup, reset the index outside that state, and render the
   selected message below the active spinner.
2. In `src/components/Spinner/useStalledAnimation.ts`, replace the 3-second
   threshold and 2-second fade with a 10-second threshold and 10-second fade.
3. In `src/constants/prompts.ts`, remove
   `getOutputEfficiencySection` and its prompt insertion.

Bind those changes to the manifest's exact target fragments and to the
focused adjacent-bundle test. Preserve the milestone strings, timings,
render condition, stall arithmetic, and prompt absence exactly.

Three prompt changes remain bundle-only:

- the shorter end-of-turn summary rule;
- the 2–3 sentence exploratory recommendation rule; and
- the 25-word/100-word numeric length anchors.

They are exact in the target bundle and absent or different in the baseline,
but the 2.1.98 source lacks the required authored experiment scaffolding. Do
not invent a TypeScript placement for them. The exact bundle delta preserves
them completely.

Generate one reversible patch over only the three supported paths:

```sh
git diff --binary -- \
  src/components/Spinner/useStalledAnimation.ts \
  src/constants/prompts.ts \
  src/screens/REPL.tsx \
  > "$CASE/recovered/thinking-progress-and-prompts.patch"

git apply --check --reverse \
  "$CASE/recovered/thinking-progress-and-prompts.patch"
```

Require:

```text
patch bytes   1,283,098
patch sha256  741a41d12819f597003f2440290e317cfea8ad4faa282260a94bb6885af2e939
paths         3
insertions    29
deletions     33
```

Run the focused source and adjacent-bundle checks:

```sh
CLAUDE_CODE_2_1_98_BUNDLE="$RECOVERY_ARTIFACTS/2.1.98/package/cli.js" \
CLAUDE_CODE_2_1_100_BUNDLE="$RECOVERY_ARTIFACTS/2.1.100/package/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.100-thinking-and-prompts.test.mjs
```

All four tests must pass. The source-lineage gate additionally
reverse-applies the patch to reproduce the exact 2.1.98 tree, reapplies it,
byte-compares the complete result, and Bun-builds all three changed paths.

## 10. Close every verification gate

Acquire fresh immutable evidence, then run:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.98/package.tgz"
```

The expected top-level result is `complete-recovery-verified`. The gate
verifies artifact identity, npm authentication, exact bundle replay,
unchanged declarations, exhaustive package reconstruction, attribution
coverage, structural accounting, readable-diff invariants, source lineage,
syntax, and target-backed tests.

The exact output identities are:

```text
2.1.100 cli.js SHA-256
d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be

2.1.100 framed package tree SHA-256
77664e78764fb8a12061576b840eb3efa6cd9f0405b6189f6c8b2edca33a83f7
```

## Semantic source reproduction check

Run the fail-closed semantic audit after acquiring the adjacent artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require all 80 nonmatched units to be classified and zero first-party source
runtime gaps. Although no changed unit is dependency-runtime, missing root
dependency/build inputs keep the whole-bundle-from-source verdict false.
