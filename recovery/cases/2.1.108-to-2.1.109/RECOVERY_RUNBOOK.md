# 2.1.108 → 2.1.109 recovery runbook

This is the reproducible construction, localization, and replay procedure for
Claude Code 2.1.109 from the directly adjacent, verified 2.1.108 base.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.108-to-2.1.109
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

## 1. Prove adjacency and acquire immutable inputs

Resolve exact versions rather than a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.108 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.109 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.108 refs/tags/v2.1.109

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.109
git -C "$UPSTREAM_GIT" rev-parse FETCH_HEAD FETCH_HEAD^ 'FETCH_HEAD^{tree}'
```

Require npm publication times `2026-04-14T18:35:26.902Z` for 2.1.108 and
`2026-04-15T03:45:21.462Z` for 2.1.109. The lightweight tags must resolve to
`5c18c787f262242a4266a12d2d1123808394fbce` and
`f348a16da8280fced433f24ede16de612dd55ffd`, respectively. The latter commit
must have the former as its sole parent and tree
`1462186bf28fecaa3bb8abd91fbdac420040882c`.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates both adjacent npm packages, the matching 2.1.88
bundle/map source-ownership oracle, and the changelog at the target tag. Pin
the exact 86-byte 2.1.109 section, SHA-256
`bbf26d72de8e74438473f61f9991c47eb8a5f4692d5e2f3a138158aa1e1a3a75`.

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.108/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.109/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.108 \
  --target-version 2.1.109 \
  --baseline-shasum 97b901484764a5867f5b0f4e95b8c5a4c82f3ab9 \
  --target-shasum 53b96dc5c083fa5b96a9b68d90358417ab6f9fcb \
  --baseline-integrity \
    'sha512-MSYnRJQNwPSlJrQZrbhyGGcvbVwJMkYqaH3VD3M4n4/3pH73spulZrCo1hZWxl5VaJRIJpc62AkEDGk0jlVjzA==' \
  --target-integrity \
    'sha512-jVy1TcNWzFP/PFbrVfKYNSWoxXe4HJw7wjnZxR72S+X/kSG4Q1d1gVrUsr4Ej7udHBSaCiStqkOI0vGiy9aKlg==' \
  --baseline-signature \
    'MEUCIDXkIjCALf88SPbqFnLi/l5WwdvlAjJvGhLSVAJqWc3HAiEAxbt4IcbfWgA4y/LmuQIKQM7qYRH2z5zusByxfnwAuZQ=' \
  --target-signature \
    'MEQCIGCuclWDstPrhsy9FPAN5NQjrm/Dw3gmJlSBwV34wdeSAiA5G0q+8spt/Lh1as7yaNG3vocLgEG6jlWy85KmEvMxYg==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.108.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.109.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

The baseline tarball must be 18,621,246 bytes with SHA-256
`be20b29860d7d708043eedf9a36bb1422e5094e7de427cbcbca4068b00e0d9b8`.
The target tarball must be 18,621,822 bytes with SHA-256
`0449b9d05b2141ba51c7a5262a7c62e68c73098b87e4fc97b5e1a517aaaf7128`.

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`. The target's unpacked members
must total 49,160,435 bytes and have framed-tree SHA-256
`d44addbf39a4d0265d529a8b93de2d8641c1ec8e5d288f833b6a9bb30bbe277b`.

## 3. Build the exact adjacent delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require a 1,800,138-byte delta with SHA-256
`e80feeb44fb51733ff0e2d0abaeb23008ce56a6de4b7daecd7407cb4e131b478`.
The builder must reconstruct and byte-compare its 13,543,570-byte target
before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.108 → 2.1.109. Both package manifests are 1,371 bytes; their SHA-256
values are
`ec380ff23f109e3be278fd77affa7655c9696b73a7c3b01b7b53b33ca4da6615`
and
`8535bdfb08b2795ac54e0ccc009748f8310a367b9cfcffeca991a94fc78908ef`.

Require both `sdk-tools.d.ts` files to be byte-identical: 117,636 bytes with
SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

## 5. Build exhaustive source attribution

Use 2.1.108 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for exact source ownership:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.109/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.109/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-f348a16d.md" \
  --changelog-section 2.1.109

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    51e13dafd441140f1cbe712cfeab1548f71274431403d6bc6873601f391f0ea6 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$RECOVERY_WORK/attribution/$name" "$CASE/attribution/$name"
done
```

Require 4,756 source rows, 4,658 target initializers, 39,005 target
partitions, and 13,477,492 / 13,477,492 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    59a01d1e0021b02c57ad91e2288659ef1833fed65fa9a19aa201204878ddf7ef \
  --expected-bytes 1967585 \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-tokens 4302774 \
  --expected-target-units 19277

cmp \
  "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every target token must be classified exactly once: 4,190,574 matched, 1,579
moved candidates, 421 coarse changed, and 110,200 unresolved. Unresolved
means no defensible adjacent pairing, not missing target code.

## 7. Independently regenerate the readable full-bundle diff

Generate into a fresh directory directly from the authenticated bundles. Do
not use the checked-in readable artifacts as generator input. On an 8 GiB
host, use the explicit 6 GiB old-space limit and do not run this concurrently
with attribution:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7

for name in \
  metadata.json \
  normalized.diff.gz \
  statements.diff \
  renames.tsv
do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    cfb37331aaa5a6dfabadcb9a59d0fdbd15d287a5922b4573ef7bbc4c3eb31fb7 \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7
```

Require comparison-invariant hash
`21b89cb2dd0576a1c6f4a650c8cef42aad73394b6ed68bdbefce9aca29e5a5fa`
and 19,274 baseline / 19,277 target statements.

## 8. Localize the semantic delta

Inspect the compact statement diff and all normalized hunks:

```sh
less "$CASE/readable-diff/statements.diff"
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
```

Require all ten meaningful runtime hunks to resolve to the same release
behavior:

1. insert the thinking-indicator renderer;
2. insert the fourteen-step hint schedule;
3. add the `Messages` prop with a false default;
4. render the hint before streaming text;
5. initialize the new renderer dependency;
6. reset response mode during loading-state cleanup;
7. remove the REPL-local timer;
8. pass the display gate into `Messages`;
9. remove the old inline hint row; and
10. remove the former five-step schedule.

Extract and hash-pin the exact bundle fragments listed in `manifest.json`.
Require the schedule to contain these one-shot timer pairs:

```text
1000    Hmm…
6000    This one needs a moment…
12000   Working through it…
20000   Untangling some thoughts…
28000   Weighing a few approaches…
36000   Consulting the rubber duck…
48000   Cross-referencing seventeen theories…
60000   Double-checking the double-checks…
80000   Almost there…
108000  Pacing in small circles…
120000  Reticulating splines…
135000  Hmm…?
150000  Staring thoughtfully into the middle distance…
165000  Still here, still at it…
```

## 9. Construct and verify the source-facing overlay

Implement only the defensible source owners:

```text
src/components/ThinkingIndicator.tsx
src/components/Messages.tsx
src/screens/REPL.tsx
```

The current source reconstruction lacks the target bundle's equivalent
pre-existing spinner store, so use the current `streamMode` state as the
display gate and label this layer `equivalent`, not exact authored spelling.
Record the exact source-tree lineage in the manifest.

Verify the patch is reversible, its target tree is exact, and its adjacent
bundle assertions pass:

```sh
git apply --check --reverse "$CASE/recovered/source-facing-overlay.patch"

CLAUDE_CODE_2_1_108_BUNDLE=\
"$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
CLAUDE_CODE_2_1_109_BUNDLE=\
"$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.109-thinking-indicator.test.mjs

for file in \
  src/components/Messages.tsx \
  src/components/ThinkingIndicator.tsx \
  src/screens/REPL.tsx
do
  pixi run bun build "$file" --target=bun --external='*' \
    --outfile="$RECOVERY_WORK/$(basename "$file").js"
done
```

The source test must prove the exact fourteen target hints and times, the
new target renderer/prop/gate, removal of the old target schedule, and the
corresponding three-path source behavior.

## 10. Run the aggregate complete-recovery gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.108/package.tgz"
```

The gate must authenticate all evidence, verify every checked-in artifact,
reverse and reapply the overlay in a temporary tree, run syntax and semantic
tests, replay the exact bundle delta, reconstruct the version-only package
metadata, copy the unchanged members, and compare all 20 resulting members
with the authenticated 2.1.109 package.

Expected status: `complete-recovery-verified`.

## 11. Independent reproducibility requirement

A recovery is not accepted merely because the aggregate gate can read its
checked-in ledgers. In a new temporary artifact and work directory, repeat
steps 1–7 and use `cmp` against every checked-in generated output:

```text
package-members.json
diff/cli.js.zstd-delta
attribution/summary.json
attribution/sources.jsonl.gz
attribution/target-initializers.jsonl.gz
attribution/target-partitions.jsonl.gz
structural/generated-delta.json.gz
readable-diff/metadata.json
readable-diff/normalized.diff.gz
readable-diff/statements.diff
readable-diff/renames.tsv
```

Then run step 10 using the newly acquired artifacts. Only byte-identical
regeneration plus `complete-recovery-verified` establishes the reusable,
verifiable recovery result.
