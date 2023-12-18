# 2.1.110 → 2.1.111 recovery runbook

This is the reproducible construction, localization, and replay procedure for
Claude Code 2.1.111 from the adjacent, verified 2.1.110 npm release.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.110-to-2.1.111
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The readable-diff generator is memory-intensive. On an 8 GiB host, run it
with the documented 6 GiB old-space limit and do not run it concurrently with
attribution.

## 1. Prove release order and pin immutable inputs

Resolve exact versions rather than a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.110 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.111 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.110 refs/tags/v2.1.111

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=4 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.111
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -4 FETCH_HEAD
```

Require npm publication times `2026-04-15T20:40:53.190Z` for 2.1.110 and
`2026-04-16T15:16:09.415Z` for 2.1.111. The lightweight tags must resolve to
`45ae2f52129b46290af61d0624a8e87eb973f57d` and
`bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88`, respectively.

Do not assert direct tag-parent adjacency. The public Git history is the
four-commit chain:

```text
45ae2f52129b46290af61d0624a8e87eb973f57d
4fb8aa4e0ac4af6c78d7bb14cc5e1fdc86a688e0
5a7bf281bab3a1bf37245ea84000b4936322eefa
bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88
```

The three post-2.1.110 commits are changelog-only. The target tag has parent
`5a7bf281bab3a1bf37245ea84000b4936322eefa` and tree
`026d0b292faa7c46efd1337b87682373cf4c3a95`. npm publication order, not a
direct Git parent edge, establishes the adjacent executable comparison.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates both adjacent npm packages, the matching 2.1.88
bundle/map source-ownership oracle, and the changelog at the target tag. Pin
the exact 4,627-byte 2.1.111 section, SHA-256
`f1d0496097042d2524c7b4756aa01fa4ea6da2ee088c21a64f1c1d61658261db`.

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.110/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.111/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.110 \
  --target-version 2.1.111 \
  --baseline-shasum 7ed162eb21a16317d82e3bd64303c437ca579870 \
  --target-shasum 267203b0c84fb25d99707cf64fe7696f1d450651 \
  --baseline-integrity \
    'sha512-H+SIbTIQlsVEhtS/+l3088uUMjGnOPigUl8PaYVE85z8mMnS0RIsy0R4QKGKIYQW/5iYjyUj+jPf5WhI0lvxLQ==' \
  --target-integrity \
    'sha512-zNZcINqvtMpDM4lZqnOZcrou57k9rUBfCZziH47nMG9FNks7I6azN7+SMU3zhwqBwYrvx6o4i7Ecu7mDCi0AmA==' \
  --baseline-signature \
    'MEUCIDNltiQgAOp+PbFMiWym1u6gBqfJcZNr8YBpiq44pCIKAiEA9AI2O1m6ZnE/rA2cNVRFNOJ0FD8Sb6MbZjTPmZn4Iso=' \
  --target-signature \
    'MEUCIQC97Pc4ImppUNA04ADBVMy7QpBk+ATo/1yVuK8e73kW9AIgX7iaTn/nILL5W65lxj2sMUPntrayOQY651Sb9N8MoG8=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.110.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.111.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`. The target's unpacked members
must total 49,328,602 bytes and have framed-tree SHA-256
`410cfb1d65e3924897162a6d682e46882208d71e32626a6001751740c2236bfb`.

## 3. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require a 2,129,673-byte delta with SHA-256
`2fdd4a69ac99a2db2a0c891a224bf4732c29317225ac53816e82e15d76f290b1`.
The builder must reconstruct and byte-compare its 13,711,605-byte target
before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.110 → 2.1.111. Both package manifests are 1,371 bytes; their SHA-256
values are
`c27d3f1dc4b58cf3f42ae833ce1f8dbcc7d73dee645aec00c369b1a8d5e8e77b`
and
`dd3725677684491b21ee5f3612f381505fd47a11f14fa067976d36a087b4e45a`.

Require `package/sdk-tools.d.ts` to remain unchanged at 117,768 bytes,
SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`.

## 5. Build exhaustive source attribution

Use 2.1.110 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for exact source ownership:

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.111/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.111/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-bf77ee65.md" \
  --changelog-section 2.1.111

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    4b89955af3ebcd28c8086d30e7b37424257101a2d73aa974584895fcf08647bf \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0

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
partitions, and 13,645,027 / 13,645,027 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    e91269453cebb58e1f1ffc85219672a3e4398f03dc36e228bccb1c6147db334e \
  --expected-bytes 2158979 \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-tokens 4335136 \
  --expected-target-units 19525

cmp \
  "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every target token must be classified exactly once: 3,686,452 matched,
14,889 moved candidates, 275,700 coarse changed, and 358,095 unresolved.
Unresolved means no defensible adjacent pairing, not missing target code.

## 7. Independently regenerate the readable full-bundle diff

Generate into a fresh directory directly from the authenticated bundles. Do
not use the checked-in readable artifacts as generator input:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0

for name in metadata.json normalized.diff.gz statements.diff renames.tsv
do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    9f3e4a43ad665c5594fcac801d46016fc005d4d5572fc48ef56e52dae048707d \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0
```

Require comparison-invariant hash
`8e2852eb809c7ea362bc92143a13c2745baf418255614a38104c60a94c066b5c`
and 19,458 baseline / 19,525 target statements.

## 8. Localize semantic changes without overclaiming source

Inspect the compact statement diff, all normalized hunks, and all 35 release
notes:

```sh
less "$CASE/readable-diff/statements.diff"
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
sed -n '/^## 2\.1\.111$/,/^## /p' \
  "$CASE/evidence/claude-code-CHANGELOG-bf77ee65.md"
```

Map a behavior into `src/` only when the cumulative source mirror contains a
defensible owner. Keep these evidence levels separate:

1. exact package bytes and exact generated bundle;
2. exhaustive generated offsets and token classifications;
3. normalized comparison and public release intent; and
4. equivalent source-facing placement where an owner is defensible.

Create the incremental patch from a clean verified 2.1.110 tree, apply only
target-backed source changes, append every untracked source file in sorted
order, and verify reversibility:

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
```

Require 1,249,152 patch bytes, SHA-256
`6a12b2b9e1817e51de53e54a4605589c7f81a473bb25183b30e846a22bc402ab`,
81 affected source paths, two additions, 2,624 insertions, and 1,066
deletions. The reverse-applied base must contain 1,948 files and 30,838,315
bytes with framed manifest SHA-256
`bafc75ec5e54272ef4350e0e7600600d1a28d7e2c379ee403c7e1dde1b38ec5c`;
the reapplied target must contain 1,950 files and 30,859,073 bytes with framed
manifest SHA-256
`9599bad7f1d9cb0fddb2abde183d3800c60ebf413c9a6a027be41a8aecfb6644`.

Do not claim exact authored spelling. Neither adjacent package contains a
source map. The less-permission-prompts body is an exception to the usual
bundled-content caution: its target literal is recovered exactly into the
defensible bundled-skill owner. `/ultrareview` is a command, not another
bundled skill. The `/setup-vertex` and `/setup-bedrock` changes stay
generated-only because their wizard scaffold has no defensible placement in
the cumulative source mirror. The ultrareview SDK handler uses the mirror's
existing `getAppState`/`setAppState` task context; do not invent the absent
task-registry refactor. Keep the target's generic cloud-environment fallback
and animated launch indicator at the exact generated layer unless their
missing owners are recovered independently.

## 9. Verify the source lineage and focused behavior tests

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

CLAUDE_CODE_2_1_110_BUNDLE="$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
CLAUDE_CODE_2_1_111_BUNDLE="$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
pixi run node --test recovery/test/recovery-2.1.111-*.test.mjs
```

Require all 26 focused assertions to pass.

The source-lineage verifier reverse-applies the patch in a temporary tree,
checks the exact base inventory, reapplies it, byte-compares the result with
the repository, syntax-builds every listed source path, and runs the focused
tests. The bundled-skill assertion is stronger than a substring check: it
decodes the target bundle's complete less-permission-prompts literal and
compares it with the prompt assembled by the defensible source owner. No
source test can upgrade any other equivalent placement into a claim of exact
original TypeScript.

## 10. Run the evidence and complete-recovery gates

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.110/package.tgz"
```

The final command emits JSON and must contain these values:

```text
status: complete-recovery-verified
bundle sha256: 8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0
package members: 20
package bytes: 49328602
target UTF-16: 13645027, unaccounted: 0
target tokens: 4335136, classified: 4335136
```
