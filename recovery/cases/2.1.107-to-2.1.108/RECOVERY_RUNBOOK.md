# 2.1.107 → 2.1.108 recovery runbook

This is the reproducible construction and replay procedure for Claude Code
2.1.108 from the directly adjacent, verified 2.1.107 base.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.107-to-2.1.108
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

## 1. Prove adjacency and acquire immutable inputs

Resolve exact versions rather than a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.107 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.108 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.107 refs/tags/v2.1.108

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.108
git -C "$UPSTREAM_GIT" rev-parse FETCH_HEAD FETCH_HEAD^
```

Require npm publication times `2026-04-14T05:18:14.905Z` for 2.1.107 and
`2026-04-14T18:35:26.902Z` for 2.1.108. The lightweight tags must resolve to
`194736a4bd11d8329974978abab33019aaad64f1` and
`5c18c787f262242a4266a12d2d1123808394fbce`, respectively. The latter commit
must have the former as its sole parent. Pin the target commit's 24-bullet
2.1.108 changelog section.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates the two adjacent npm packages, the matching 2.1.88
bundle/map source-ownership oracle, and the changelog at the target tag.

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.107/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.108/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.107 \
  --target-version 2.1.108 \
  --baseline-shasum 8f27b1d88d1656de52442547c6e8bdc32161a301 \
  --target-shasum 97b901484764a5867f5b0f4e95b8c5a4c82f3ab9 \
  --baseline-integrity \
    'sha512-qZ7DJfe0hSGu5dGvmyImZJ94wLPRutOs/DbzNsMkkyj4KP09PKQ0FSFCZhs2FoAeDdil9IedJOaYqtxJhOzQbQ==' \
  --target-integrity \
    'sha512-MSYnRJQNwPSlJrQZrbhyGGcvbVwJMkYqaH3VD3M4n4/3pH73spulZrCo1hZWxl5VaJRIJpc62AkEDGk0jlVjzA==' \
  --baseline-signature \
    'MEUCIBP9KiiNQZyh921pfjmAuL8vlen5LWOv7TYWGxUuetEbAiEAgbnHt4//rngNIVjjf8qMqzQfqeOMIS4wKMIefccMMfk=' \
  --target-signature \
    'MEUCIDXkIjCALf88SPbqFnLi/l5WwdvlAjJvGhLSVAJqWc3HAiEAxbt4IcbfWgA4y/LmuQIKQM7qYRH2z5zusByxfnwAuZQ=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.107.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.108.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

The baseline tarball must be 18,646,371 bytes with SHA-256
`447f42addc14dadf679873899b9758f7f09ec723c3de9787d5493070561842e7`.
The target tarball must be 18,621,246 bytes with SHA-256
`be20b29860d7d708043eedf9a36bb1422e5094e7de427cbcbca4068b00e0d9b8`.

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`. The target's 20 unpacked members
must total 49,159,703 bytes and have framed-tree SHA-256
`277fff5e219e13fc935cc079a30b0e07818e5dc98e4f3eb1682a1dbf60048ba6`.

## 3. Build the exact adjacent delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require a 2,152,865-byte delta with SHA-256
`da4d79c4d04d888c1d634d7600609d09bac219fb8ad503783a3c5d33ef6797bc`.
The builder must reconstruct and byte-compare its 13,542,838-byte target
before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.107 → 2.1.108. Both package manifests are 1,371 bytes; their SHA-256
values are, respectively,
`aaa4a27b4093ee4946b34a37a735029bdbc4bf7b4599f2360a13fe5ff8a2988a`
and
`ec380ff23f109e3be278fd77affa7655c9696b73a7c3b01b7b53b33ca4da6615`.

Require the baseline and target `sdk-tools.d.ts` files to be byte-identical:
117,636 bytes with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

## 5. Build exhaustive source attribution

Use 2.1.107 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for source ownership:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.108/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.108/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-5c18c787.md" \
  --changelog-section 2.1.108

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    22e15b2c4f4862269fd8eed9dad2f7fc958fced3614d5a8bd16e50cd1466533b \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73
```

Require 4,756 source rows, 4,657 target initializers, 39,006 target
partitions, and 13,476,768 / 13,476,768 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    bebb1c1c2e0459fa186ef8de92bff9bba5bcfcb474e15f5fa14ed0745f0ffb8e \
  --expected-bytes 2202161 \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-tokens 4302522 \
  --expected-target-units 19274

cmp \
  "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every one of the 4,302,522 target tokens must be classified exactly once:
3,632,808 matched, 119,438 moved candidates, 121,605 coarse changed, and
428,671 unresolved. Unresolved means no defensible adjacent pairing; it does
not mean missing target code.

## 7. Independently regenerate the readable full-bundle diff

Generate the readable artifacts into a fresh directory directly from the
authenticated adjacent bundles. Do not copy or use the checked-in readable
artifacts as generator input. On an 8 GiB host, use the explicit 6 GiB
old-space limit and do not run this concurrently with attribution:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.108/package/cli.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73

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
    1f2ad88dee586fa77289995550e0b976a25dedf0a50f03291b6dd3b3e0bef427 \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73
```

Require comparison-invariant hash
`a18dff8c3e895fd98da354aa6c7f4dd9cd30bfc61610ab4d13c22bcd05197cd1`.
The fresh output must contain 19,123 baseline and 19,274 target statements.

## 8. Localize only defensible source edits

The exact bundle and release evidence support 22 incremental release-note
behaviors across these 24 source paths:

```text
src/bridge/initReplBridge.ts
src/commands.ts
src/commands/model/model.tsx
src/commands/rewind/index.ts
src/components/Feedback.tsx
src/components/LogoV2/LogoV2.tsx
src/constants/prompts.ts
src/hooks/usePasteHandler.ts
src/main.tsx
src/native-ts/color-diff/index.ts
src/screens/REPL.tsx
src/services/api/claude.ts
src/services/api/errors.ts
src/services/plugins/pluginOperations.ts
src/tools/SkillTool/SkillTool.ts
src/utils/cliHighlight.ts
src/utils/earlyInput.ts
src/utils/highlightLanguages/index.ts
src/utils/permissions/permissions.ts
src/utils/processUserInput/processSlashCommand.tsx
src/utils/sessionStorage.ts
src/utils/sessionTitle.ts
src/utils/shell/bashProvider.ts
src/utils/suggestions/commandSuggestions.ts
```

The `/recap` behavior and current-directory `/resume` filtering were already
present in both adjacent bundles, so they receive no incremental source edit.
Generate and reverse-check the consolidated patch from the pinned 2.1.107
source tree:

```sh
BASE_COMMIT=3848dd0b1826c7ccf5a5716541ed5d9b7dc93f08
test "$(git rev-parse "$BASE_COMMIT:src")" = \
  2af47254e97b933170d606a9199cb6c1c3bcad34

git diff --binary --unified=1 "$BASE_COMMIT" -- \
  src/bridge/initReplBridge.ts \
  src/commands.ts \
  src/commands/model/model.tsx \
  src/commands/rewind/index.ts \
  src/components/Feedback.tsx \
  src/components/LogoV2/LogoV2.tsx \
  src/constants/prompts.ts \
  src/hooks/usePasteHandler.ts \
  src/main.tsx \
  src/native-ts/color-diff/index.ts \
  src/screens/REPL.tsx \
  src/services/api/claude.ts \
  src/services/api/errors.ts \
  src/services/plugins/pluginOperations.ts \
  src/tools/SkillTool/SkillTool.ts \
  src/utils/cliHighlight.ts \
  src/utils/earlyInput.ts \
  src/utils/highlightLanguages/index.ts \
  src/utils/permissions/permissions.ts \
  src/utils/processUserInput/processSlashCommand.tsx \
  src/utils/sessionStorage.ts \
  src/utils/sessionTitle.ts \
  src/utils/shell/bashProvider.ts \
  src/utils/suggestions/commandSuggestions.ts \
  > "$CASE/recovered/source-facing-overlay.patch"

git apply --check --reverse \
  "$CASE/recovered/source-facing-overlay.patch"
```

Require 568,467 bytes, SHA-256
`221665eec1d52156ec56c55c24f85b67755815adfb720aa030bd4b514f0e0f9c`,
1,173 insertions, and 308 deletions. The source tree moves from 1,933 files,
30,720,127 bytes, and framed-manifest SHA-256
`a7daf57d10ca998ac049a901efef49da28df11a8b1dada14c367a2a8260382b7`
to 1,933 files, 30,748,085 bytes, and framed-manifest SHA-256
`9123013c914a3963730928067368719fe4f3db7d7099e46696bbcf886a990e96`.

Keep unsupported authored details bundle-only. Neither adjacent package has a
source map, so exact erased TypeScript names, types, comments, formatting, and
module boundaries remain unobservable. In particular, retain the target
`external-build-2203` provenance stamp in the exact bundle delta without
inventing a source-facing owner.

## 9. Reconstruct the package and close every gate

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.107/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.107/package.tgz"
```

The aggregate gate independently validates all pinned generated files,
reconstructs and byte-compares the complete target package, verifies the
source patch forward and reverse from the pinned base commit, syntax-builds
all 24 changed TypeScript/TSX paths, and runs the eight target-backed semantic
tests.

Require:

```text
status          complete-recovery-verified
bundle bytes    13542838
bundle sha256   dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73
package members 20
package bytes   49159703
package sha256  277fff5e219e13fc935cc079a30b0e07818e5dc98e4f3eb1682a1dbf60048ba6
source files    1933
source bytes    30748085
source sha256   9123013c914a3963730928067368719fe4f3db7d7099e46696bbcf886a990e96
semantic tests  8
```
