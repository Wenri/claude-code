# 2.1.109 → 2.1.110 recovery runbook

This is the reproducible construction, localization, and replay procedure for
Claude Code 2.1.110 from the directly adjacent, verified 2.1.109 base.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.109-to-2.1.110
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The readable-diff generator is memory-intensive. On an 8 GiB host, run it
with the documented 6 GiB old-space limit and do not run it concurrently with
attribution.

## 1. Prove adjacency and pin immutable inputs

Resolve exact versions rather than a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.109 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.110 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.109 refs/tags/v2.1.110

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.110
git -C "$UPSTREAM_GIT" rev-parse \
  FETCH_HEAD FETCH_HEAD^ 'FETCH_HEAD^{tree}'
```

Require npm publication times `2026-04-15T03:45:21.462Z` for 2.1.109 and
`2026-04-15T20:40:53.190Z` for 2.1.110. The lightweight tags must resolve to
`f348a16da8280fced433f24ede16de612dd55ffd` and
`45ae2f52129b46290af61d0624a8e87eb973f57d`, respectively. The latter commit
must have the former as its sole parent and tree
`042f779aef34869ca9dfea0d28151de10fa4726d`.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates both adjacent npm packages, the matching 2.1.88
bundle/map source-ownership oracle, and the changelog at the target tag. Pin
the exact 3,714-byte 2.1.110 section, SHA-256
`408a20f1f236c0b002bcb70334bec07b5e302684bd64c71780fbd34a92c94545`.

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.109/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.110/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.109 \
  --target-version 2.1.110 \
  --baseline-shasum 53b96dc5c083fa5b96a9b68d90358417ab6f9fcb \
  --target-shasum 7ed162eb21a16317d82e3bd64303c437ca579870 \
  --baseline-integrity \
    'sha512-jVy1TcNWzFP/PFbrVfKYNSWoxXe4HJw7wjnZxR72S+X/kSG4Q1d1gVrUsr4Ej7udHBSaCiStqkOI0vGiy9aKlg==' \
  --target-integrity \
    'sha512-H+SIbTIQlsVEhtS/+l3088uUMjGnOPigUl8PaYVE85z8mMnS0RIsy0R4QKGKIYQW/5iYjyUj+jPf5WhI0lvxLQ==' \
  --baseline-signature \
    'MEQCIGCuclWDstPrhsy9FPAN5NQjrm/Dw3gmJlSBwV34wdeSAiA5G0q+8spt/Lh1as7yaNG3vocLgEG6jlWy85KmEvMxYg==' \
  --target-signature \
    'MEUCIDNltiQgAOp+PbFMiWym1u6gBqfJcZNr8YBpiq44pCIKAiEA9AI2O1m6ZnE/rA2cNVRFNOJ0FD8Sb6MbZjTPmZn4Iso=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.109.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.110.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require 20 baseline and target members, 17 unchanged, exactly three changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js`, `package/package.json`, and `package/sdk-tools.d.ts`. The
target's unpacked members must total 49,226,979 bytes and have framed-tree
SHA-256
`23e2c220198c2c0ad0e58670acd27a652e41afe5ff5f76f49999112f6cf7a77e`.

## 3. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require a 2,117,328-byte delta with SHA-256
`2aa2cd3fea6c56d795996c15134af802f27439074dc2dc368a209735479b8965`.
The builder must reconstruct and byte-compare its 13,609,982-byte target
before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.109 → 2.1.110. Both package manifests are 1,371 bytes; their SHA-256
values are
`8535bdfb08b2795ac54e0ccc009748f8310a367b9cfcffeca991a94fc78908ef`
and
`c27d3f1dc4b58cf3f42ae833ce1f8dbcc7d73dee645aec00c369b1a8d5e8e77b`.

Require the 117,636-byte baseline declaration, SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`,
to become the 117,768-byte target, SHA-256
`98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d`,
through the one exact `FileWriteOutput.userModified?: boolean` insertion in
`manifest.json`.

## 5. Build exhaustive source attribution

Use 2.1.109 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for exact source ownership:

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.110/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.110/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-45ae2f52.md" \
  --changelog-section 2.1.110

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    368a5f1288d225956d71fd3d040f3caf80aca542e7d4be06edcd9c47a9829aee \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 4,756 source rows, 4,677 target initializers, 34,460 target
partitions, and 13,543,815 / 13,543,815 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    91ee33f66bb3db184f6ef4458e9a67dc33a1c4191e681b78acaaf2ab991bf530 \
  --expected-bytes 2180866 \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-tokens 4325806 \
  --expected-target-units 19458

cmp \
  "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every target token must be classified exactly once: 3,090,117 matched,
587,967 moved candidates, 240,424 coarse changed, and 407,298 unresolved.
Unresolved means no defensible adjacent pairing, not missing target code.

## 7. Independently regenerate the readable full-bundle diff

Generate into a fresh directory directly from the authenticated bundles. Do
not use the checked-in readable artifacts as generator input:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861

for name in metadata.json normalized.diff.gz statements.diff renames.tsv
do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    75ceb96fd85d0fc419da2264feae84495b3dcdb00d1a85260125572931d081e9 \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861
```

Require comparison-invariant hash
`80c99e9137802c4f8475b60d2150794c68ff29aaa9c388697d742565aa447210`
and 19,277 baseline / 19,458 target statements.

## 8. Localize semantic changes without overclaiming source

Inspect the compact statement diff, all normalized hunks, and the full 32
release-note bullets:

```sh
less "$CASE/readable-diff/statements.diff"
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
sed -n '/^## 2\.1\.110$/,/^## /p' \
  "$CASE/evidence/claude-code-CHANGELOG-45ae2f52.md"
```

Map a behavior into `src/` only when the cumulative source mirror contains a
defensible owner. Keep these evidence levels separate:

1. exact package bytes and exact generated bundle;
2. exhaustive generated offsets and token classifications;
3. binding-aware but non-executable readable diff; and
4. source-facing behavioral placement, whose original spelling is not
   observable without a target source map.

The source audit covered terminal/UI, plugins, MCP/API reliability, Remote
Control, scheduled resume, session storage, permissions/hooks, skills,
headless tracing, recap, cleanup, titles, and editor/runtime hardening. It
also identified the provider setup-wizard relaunch scaffold as absent from
the source mirror. Preserve its TTY-sever behavior in the exact generated
recovery and record it as a source limitation rather than inventing an
authored module placement.

## 9. Build and verify the source-facing overlay

The recovery was developed against source base commit
`24f983bdbd6a2f1dadba452f9bdd6aea077c3238`, whose `src` Git tree is
`3b1bcf5e438e0ace4efb0193eb4a1bd4b70d043d`. To regenerate the patch from an
equivalent working tree after applying the recovered edits:

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

Require 2,472,185 patch bytes, SHA-256
`41675ceb46527d281529cac7e3c2cb9106f68fb60e03afbcc5f204a6fe568a67`,
88 affected paths, 3,972 insertions, and 642 deletions. The lineage verifier
must reverse to this exact base tree and reapply to this exact target tree:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Base | 1,934 | 30,749,350 | `8ae464c71601aca3e8b52bf562a9f7db1ab1a884c04d1e6d94d12823a17bfc67` |
| Target | 1,948 | 30,838,315 | `bafc75ec5e54272ef4350e0e7600600d1a28d7e2c379ee403c7e1dde1b38ec5c` |

Run the focused tests directly when iterating:

```sh
CLAUDE_CODE_2_1_109_BUNDLE="$RECOVERY_ARTIFACTS/2.1.109/package/cli.js" \
CLAUDE_CODE_2_1_110_BUNDLE="$RECOVERY_ARTIFACTS/2.1.110/package/cli.js" \
pixi run node --test recovery/test/recovery-2.1.110-*.test.mjs
```

The expected result is 12 passing tests. Syntax-build every path listed in
`manifest.json` under `sourceLineage.syntaxCheck`; the aggregate verifier does
this in a temporary reconstructed target tree.

## 10. Run the evidence and complete-recovery gates

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.109/package.tgz"
```

The final command emits JSON and must contain these values:

```text
status: complete-recovery-verified
bundle sha256: cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861
package members: 20
package bytes: 49226979
target UTF-16: 13543815, unaccounted: 0
target tokens: 4325806, classified: 4325806
tests: 12
```
