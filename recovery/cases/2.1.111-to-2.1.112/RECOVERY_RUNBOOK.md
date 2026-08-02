# 2.1.111 → 2.1.112 recovery runbook

This is the reproducible construction, localization, and replay procedure for
Claude Code 2.1.112 from the adjacent, verified 2.1.111 npm release.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.111-to-2.1.112
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The readable-diff generator is memory-intensive. On an 8 GiB host, run it
with the documented 6 GiB old-space limit and do not run it concurrently with
attribution.

## 1. Prove release order and pin immutable inputs

Resolve exact versions rather than a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.111 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.112 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.111 refs/tags/v2.1.112

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.112
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -2 FETCH_HEAD
```

Require npm publication times `2026-04-16T15:16:09.415Z` for 2.1.111 and
`2026-04-16T19:23:46.419Z` for 2.1.112. The lightweight tags must resolve to
`bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88` and
`2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff`, respectively.

The target tag directly names the baseline tag as its parent:

```text
2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff
parent: bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88
tree:   e740b6148e4274524e52d58b6a2d341a430d6282
```

The public tag commit changes only `CHANGELOG.md`; the authored
implementation is not present there. The signed adjacent npm packages remain
the executable authority.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates both adjacent npm packages, the matching 2.1.88
bundle/map source-ownership oracle, and the changelog at the target tag. Pin
the exact 80-byte 2.1.112 section, SHA-256
`30b0015d131c30e3a66ab13ddb342ccb7e6556be4a9afb51ec96789534bb38b6`.
It contains one release bullet.

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.111/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.112/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.111 \
  --target-version 2.1.112 \
  --baseline-shasum 267203b0c84fb25d99707cf64fe7696f1d450651 \
  --target-shasum 318f43288d7056ae1eae9a23f4b7531ef3c67d31 \
  --baseline-integrity \
    'sha512-zNZcINqvtMpDM4lZqnOZcrou57k9rUBfCZziH47nMG9FNks7I6azN7+SMU3zhwqBwYrvx6o4i7Ecu7mDCi0AmA==' \
  --target-integrity \
    'sha512-9FUgJ0EOvILyhIqxFKNVliebiUjL68dwpEW3eGSSe0vkVDJ1c5qMDNWc22gW3zkD7zRAqtfQPSGv0t4vMM2DPA==' \
  --baseline-signature \
    'MEUCIQC97Pc4ImppUNA04ADBVMy7QpBk+ATo/1yVuK8e73kW9AIgX7iaTn/nILL5W65lxj2sMUPntrayOQY651Sb9N8MoG8=' \
  --target-signature \
    'MEUCIQDNq+V7L+Ux4Tqk1/LPdRRGFISaAt8swegEx6TzM4T+cAIgaIK07ApqnGOyp4GGh7oejfKBxqufKt5pL6R7l8cU1RU=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.111.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.112.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`. The target's unpacked members
must total 49,328,681 bytes and have framed-tree SHA-256
`938bdf827e5fa7181cff5360cb2f028447cf865bd26c129d1edbcaa8af377fac`.

## 3. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require a 1,028,916-byte delta with SHA-256
`c74631367b90863c7f521f096d806536e96de26c4536e1e9251d4a626d85844a`.
The builder must reconstruct and byte-compare its 13,711,684-byte target
before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.111 → 2.1.112. Both package manifests are 1,371 bytes; their SHA-256
values are
`dd3725677684491b21ee5f3612f381505fd47a11f14fa067976d36a087b4e45a`
and
`56cd40fd6b7bb73da50ec9259805e3363150a5bc218b69d6dba5bd51a3f27cc0`.

Require `package/sdk-tools.d.ts` to remain unchanged at 117,768 bytes,
SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.

Record, but do not source-localize, the generated provenance change
`external-build-2172` → `external-build-2239`.

## 5. Build exhaustive source attribution

Use 2.1.111 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for exact source ownership:

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.112/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.112/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-2b53fac3.md" \
  --changelog-section 2.1.112

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    43ec0e73f45649889a019c7eb4a54163ac41f6570f13ede862c2a363be05d516 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 4,756 source rows, 4,684 target initializers, 34,366 target
partitions, and 13,645,106 / 13,645,106 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    545900350eed707098a25d1221e66021ee89c0cda04acdf2e33bc01a53c8e277 \
  --expected-bytes 1987262 \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-tokens 4335166 \
  --expected-target-units 19526

cmp \
  "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every target token must be classified exactly once: 4,252,777 matched and
82,389 unresolved, with zero moved or coarse-changed classifications.
Unresolved means no defensible adjacent pairing, not missing target code.

## 7. Independently regenerate the readable full-bundle diff

Generate into a fresh directory directly from the authenticated bundles. Do
not use the checked-in readable artifacts as generator input:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f

for name in metadata.json normalized.diff.gz statements.diff renames.tsv
do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    b73fc10dd74f34868bfa5b0b4ed59a25994ee9eb803b17f8408011399715f99e \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f
```

Require comparison-invariant hash
`2471a6b61446834ad5b795f8bc65ba9d2a6b1f12019757ac6d8acd1527c1fb5b`
and 19,525 baseline / 19,526 target statements.

## 8. Localize semantic changes without overclaiming source

Inspect the compact statement diff, every normalized hunk, and the release
note:

```sh
less "$CASE/readable-diff/statements.diff"
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
sed -n '/^## 2\.1\.112$/,/^## /p' \
  "$CASE/evidence/claude-code-CHANGELOG-2b53fac3.md"
```

Map a behavior into `src/` only when the cumulative source mirror contains a
defensible owner. Keep these evidence levels separate:

1. exact package bytes and exact generated bundle;
2. exhaustive generated offsets and token classifications;
3. normalized comparison and public release intent; and
4. equivalent source-facing placement where an owner is defensible.

The adjacent target proves one predicate and two uses:

- canonical Opus 4.7 names do not support sending `temperature`;
- the main request builder sends temperature only when thinking is disabled
  and the model supports temperature; and
- the side-query builder applies the same capability guard after normalizing
  the selected model.

Place the predicate in the existing model-capability owner
`src/utils/betas.ts`, and guard the request construction in
`src/services/api/claude.ts` and `src/utils/sideQuery.ts`. The source-facing
name `modelSupportsTemperature` is descriptive but not asserted as upstream
spelling: the original helper name is erased by minification.

Do not expand this incremental patch to repair historical gaps. In
particular, the structured-output source-placement gap inherited from the
2.1.111 base is not part of the 2.1.112 delta. Keep build-stamp changes and
unplaceable minifier churn at the exact generated layer.

## 9. Freeze and verify the source-facing overlay

Create the incremental patch from the clean verified 2.1.111 repository
base, append any untracked source paths in sorted order, and verify
reversibility:

```sh
PATCH_REGEN="$RECOVERY_WORK/source-facing-overlay.patch"
git diff --binary HEAD -- src > "$PATCH_REGEN"

while IFS= read -r source_path
do
  git diff --binary --no-index -- /dev/null "$source_path" \
    >> "$PATCH_REGEN" || test "$?" -eq 1
done < <(git ls-files --others --exclude-standard src | sort)

cmp "$PATCH_REGEN" "$CASE/recovered/source-facing-overlay.patch"
git apply --check --reverse "$CASE/recovered/source-facing-overlay.patch"
git apply --numstat "$CASE/recovered/source-facing-overlay.patch"
```

Require 2,911 patch bytes, SHA-256
`31835938183f03bdef564e84b909c1c61cf4334c5b1c127e9154ba7a780b40c7`,
three affected source paths, no additions, 16 insertions, and five deletions.
The repository base must be commit
`5e168e7272e2eb510b16d7141538bb3f4836749a`, with `src` Git tree
`e7ad7e73883d144c33df5d264dc03733e4777934`.

The reverse-applied base must contain 1,950 files and 30,859,073 bytes with
framed manifest SHA-256
`9599bad7f1d9cb0fddb2abde183d3800c60ebf413c9a6a027be41a8aecfb6644`;
the reapplied target must contain 1,950 files and 30,859,372 bytes with framed
manifest SHA-256
`a4a78ad2e102ea43ab739cf19ab1018ed52a1c809171f73b77e7c9e973ad9195`.

## 10. Verify source lineage and focused behavior

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

CLAUDE_CODE_2_1_111_BUNDLE="$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
CLAUDE_CODE_2_1_112_BUNDLE="$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
pixi run node --test recovery/test/recovery-2.1.112-*.test.mjs
```

Require all focused assertions to pass. They must cover the source capability
owner, the main and side-query guards, exact adjacent-bundle hashes, target
helper shape, both generated call sites, and the 79-byte bundle-size delta.

The source-lineage verifier reverse-applies the patch in a temporary tree,
checks the exact base inventory, reapplies it, byte-compares the result with
the repository, syntax-builds every listed source path, and runs the focused
tests. These checks establish equivalent placement; they do not recover the
erased original helper name.

## 11. Run the evidence and complete-recovery gates

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.111/package.tgz"
```

The final command emits JSON and must contain these values:

```text
status: complete-recovery-verified
bundle sha256: bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f
package members: 20
package bytes: 49328681
package framed tree: 938bdf827e5fa7181cff5360cb2f028447cf865bd26c129d1edbcaa8af377fac
target UTF-16: 13645106, unaccounted: 0
target tokens: 4335166, classified: 4335166
```
