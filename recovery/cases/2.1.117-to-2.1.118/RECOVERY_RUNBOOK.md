# Claude Code 2.1.117 → 2.1.118 recovery runbook

This procedure reproduces the exact generated/package recovery, verifies the
frozen source-facing localization in a disposable applied-target worktree,
and returns that worktree to the 2.1.118 target after a reverse/reapply audit.
The shared `src/` tree is handed off applied at the exact target summary; do
not apply the overlay there a second time.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.117-to-2.1.118
CASE_ABS=$(realpath "$CASE")
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
RECOVERY_TARGET="$RECOVERY_WORK/applied-target"
```

Keep both temporary directories for the full run. Use exact versions and
manifest-pinned URLs; do not acquire through mutable npm tags.

## 1. Prove publication adjacency and acquire evidence

Query both wrapper and Linux x64 packages for 2.1.117 and 2.1.118, and require
2.1.118 to be the next published registry version:

```sh
for version in 2.1.117 2.1.118; do
  pixi run npm view "@anthropic-ai/claude-code@$version" \
    version time dist --json
  pixi run npm view "@anthropic-ai/claude-code-linux-x64@$version" \
    version time dist --json
done

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.117 refs/tags/v2.1.118
```

Require no skipped registry version. In Git, require the two-commit chain
`2fa67717… → 9afdfd7d… → 925200df…` and a tag-to-tag public diff containing
only `CHANGELOG.md` (+38/-0). Verify the 34-bullet pinned section at
[`evidence/CHANGELOG-2.1.118.md`](./evidence/CHANGELOG-2.1.118.md).

Acquire and verify every manifest-pinned artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

The evidence verifier includes cumulative source-oracle assertions, so the
clean-room replay runs it against the disposable applied target created in
section 7. The final applied shared tree may also be verified directly.

## 2. Authenticate and reconstruct the wrapper

Regenerate the exhaustive seven-member comparison using the registry SHA-1,
SHA-512 SRI, signatures, and public key pinned in
[`evidence/provenance.json`](./evidence/provenance.json), then compare it:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.117/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.118/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.117 \
  --target-version 2.1.118 \
  --baseline-shasum c821c4495532412bd0d79de4581f5ce22dd75798 \
  --target-shasum a96c2aa0723f0baaad6df16eb93fb2fb1d3e9a24 \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.117.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.118.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

When invoking the comparison independently, also pass the exact integrity,
signature, key ID, and public-key values from the provenance report. Require
seven target paths, five unchanged, two changed, no additions/removals, and
132,031 member bytes. The changed paths are `package/package.json` and
`package/sdk-tools.d.ts`.

Reconstruct all seven members:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.117/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"
```

Require 132,031 bytes and framed-tree SHA-256
`72c0c29d2bf08d2309560c7496ae91a2c1282b2f452ec484114f971d67a99094`.

## 3. Verify the native package and Bun graph

Verify the target tarball and executable identities:

```text
9265b84455ce045a77e89a822ddeed6dabfbb920a4cda5e8f38ef1ec55d7c45c  package.tgz
ba363b2410a47120d2d4b8ece2e11fe0bbc5d59adb1329e8fb87ea0f370f4e46  package/claude
```

Regenerate the signed four-member native inventory as in section 2, using
`@anthropic-ai/claude-code-linux-x64` and the exact registry fields from the
provenance report. Compare it with
[`binary-extraction/native-package-members.json`](./binary-extraction/native-package-members.json).
Require four paths, two unchanged and two changed, with 239,574,218 target
member bytes.

`bun_graph` is an optional discovery cross-check. Canonical extraction uses
the manifest-declared direct slices and the independent parser:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five records, exact content/JSC ranges, the
87-byte CLI prefix and three-byte suffix, and the target analyzable identity
13,234,618 bytes / SHA-256
`84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa`.

## 4. Regenerate and replay every exact delta

[`diff/README.md`](./diff/README.md) contains the canonical five endpoint
specifications. For each, regenerate and compare the payload, then replay the
checked payload and compare the result with the authenticated target:

```sh
generated_dir=$(mktemp -d)
replay_dir=$(mktemp -d)

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.js" \
  --output "$generated_dir/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744 \
  --expected-target-sha256 \
    fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba

cmp "$generated_dir/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"

pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.js" \
  "$CASE/diff/cli.js.zstd-delta" \
  -o "$replay_dir/cli.js" --force

cmp "$replay_dir/cli.js" \
  "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.js"
```

Repeat for `image-processor.js`, `audio-capture.js`, `package.json`, and
`sdk-tools.d.ts` with the hashes listed in the payload README. Fresh payloads
must be byte-identical. The five checked payloads total 2,163,251 bytes.

Reconstruct the full embedded graph:

```sh
pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require three files, 13,239,834 bytes, and framed-tree SHA-256
`ace0550ae45d75efbd936921f235c9eebc9950fa2d53e418f9541553f136c3eb`.

## 5. Verify exhaustive attribution and structural accounting

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$CASE/attribution" \
  --expected-summary-sha256 \
    a10190995c89c30e902c55e0faa94fe5a94f9fa272245d815fa02e1af5f1705c \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa
```

Require 59,281 exhaustive target ranges, 13,234,618 accounted UTF-16 units,
and zero unaccounted units. The verifier consumes every exact anchor and every
partition in order and rejects gaps, overlaps, malformed ownership, or a
non-canonical gzip stream.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$CASE/structural/generated-delta.json.gz" \
  --expected-sha256 \
    ccd1e94aeb39abceed08f96c58e1ad568b757450d5b8cb421192646f1544b20e \
  --expected-bytes 2429007 \
  --expected-baseline-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa \
  --expected-target-tokens 4143320 \
  --expected-target-units 20986
```

Require all 4,143,320 tokens and 20,986 units to be classified exactly once.

## 6. Verify the readable review layer

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$CASE/readable-diff" \
  --expected-metadata-sha256 \
    f4e5d99b5cf9a5028672701c5d7ce7c43f358cc43bbb0e1cd73a1a2d4ff226b2 \
  --expected-baseline-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa
```

Require `readable-diff-verified` and equal comparison-invariant hashes. This
normalized output is review evidence, never an exact replay input.

## 7. Freeze and verify semantic correspondence

Create a disposable checkout from the applied repository handoff. Confirm its
`src/` tree is the exact 2.1.118 target, reverse only this case's overlay to
recover the exact 2.1.117 base, then reapply it for clean-room verification:

```sh
git worktree add --detach "$RECOVERY_TARGET" HEAD

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree(process.argv[1]);
  console.log(JSON.stringify(summary));
' "$RECOVERY_TARGET/src"

git -C "$RECOVERY_TARGET" apply --reverse --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
git -C "$RECOVERY_TARGET" apply --reverse \
  "$CASE_ABS/recovered/source-facing-overlay.patch"

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree(process.argv[1]);
  console.log(JSON.stringify(summary));
' "$RECOVERY_TARGET/src"

git -C "$RECOVERY_TARGET" apply --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
git -C "$RECOVERY_TARGET" apply \
  "$CASE_ABS/recovered/source-facing-overlay.patch"

pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo "$RECOVERY_TARGET" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require the target summary `2,022 / 31,570,676 / c91ebcc1…3d59` initially,
the base summary `1,957 / 30,993,723 / 135719f7…27cee` after reversal, and the
same target summary again after reapplication.

Regenerate the canonical semantic report and compare both outputs before
running the strict verifier:

```sh
SEMANTIC_REGEN="$RECOVERY_WORK/semantic"
mkdir "$SEMANTIC_REGEN"

pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution "$CASE/attribution" \
  --structural "$CASE/structural/generated-delta.json.gz" \
  --obligations "$CASE/semantic/obligations.json" \
  --changelog "$CASE/evidence/CHANGELOG-2.1.118.md" \
  --source-root "$RECOVERY_TARGET/src" \
  --baseline "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.inner.js" \
  --output "$SEMANTIC_REGEN/semantic-correspondence.json.gz" \
  --summary "$SEMANTIC_REGEN/summary.json"

cmp "$SEMANTIC_REGEN/semantic-correspondence.json.gz" \
  "$CASE/semantic/semantic-correspondence.json.gz"
cmp "$SEMANTIC_REGEN/summary.json" "$CASE/semantic/summary.json"

pixi run node recovery/scripts/verify-semantic-correspondence.mjs \
  --attribution "$CASE/attribution" \
  --structural "$CASE/structural/generated-delta.json.gz" \
  --obligations "$CASE/semantic/obligations.json" \
  --changelog "$CASE/evidence/CHANGELOG-2.1.118.md" \
  --source-root "$RECOVERY_TARGET/src" \
  --baseline "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.inner.js" \
  --report "$CASE/semantic/semantic-correspondence.json.gz" \
  --summary "$CASE/semantic/summary.json" \
  --expected-report-sha256 \
    be4c1537e82f4666a3f45f67c65551940297514308e5bec1f82a24362af84e59 \
  --expected-summary-sha256 \
    91cf36ee4b348ba2de247f2ee6f930349611377ca9e3c31ff8cedf78a2f279ca
```

Require 73 obligations, 121 authenticated fragments, 149 recovered source
assertions, one source removal, 62 adjacent and 11 inherited classifications,
34/34 official bullets plus 39 hidden obligations, and all four test-catalog
entries used. Seventy obligations must use generated attribution; the three
explicit `authenticated-behavior-test` boundaries must be Config-tool
unregistration, daemon schemas, and keybinding DOM dispatch. Require zero
unverified obligations, zero unresolved application-source owners, and
4,143,320/4,143,320 classified tokens.

## 8. Freeze, apply, and verify the source overlay

The patch is applied in the shared tree and was reversed/reapplied in
`RECOVERY_TARGET` above. Do not apply it again to the shared tree. Its immutable
identity is 3,865,180 bytes / SHA-256
`fc47a3190c81fc255b9e497af3cb95eb97ef6371ea359fb4c12a7e16f82500d4`.
It contains 306 paths (241 modified and 65 added), 21,736 insertions, and
3,261 deletions.

The manifest asserts:

- the patch bytes and SHA-256;
- exact base and target state for every changed path;
- path/status and insertion/deletion counts;
- base and target source-tree file/byte/framed-hash summaries;
- target-existing TypeScript/TSX syntax paths;
- exact bundle-fragment evidence and semantic obligations; and
- focused test files, commands, environments, and pass counts.

Run the lineage verifier against the disposable applied target:

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo "$RECOVERY_TARGET" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `source-lineage-verified`, exact reverse/reapply tree comparison, 280
syntax paths, five byte/hash-bound test/support files, and 21/21 focused
tests. The tightened generic verifier has SHA-256
`6ff5e8b4a02174772e26513bb31114d5f2bcde9d2105a6dfc79ce4544cbe4cbe`;
its dedicated suite passes 6/6, including two negative assertion tests.

## 9. Run the complete gate

Run the aggregate gate while the disposable worktree is still at the applied
2.1.118 target:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.117/package.tgz" \
  --repo "$RECOVERY_TARGET"
```

Require `complete-recovery-verified` and these eleven checks:

```text
evidence-verified
bun-container-verified
source-lineage-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
whole-bundle-source-correspondence-verified
whole-bundle-source-semantics-verified
readable-diff-verified
embedded-code-reconstructed
exact-package-tree-reconstructed
```

Finally reverse only this case's overlay in the disposable worktree, require
the exact 2.1.117 base summary, then reapply it and finish at the exact 2.1.118
target:

```sh
git -C "$RECOVERY_TARGET" apply --reverse --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
git -C "$RECOVERY_TARGET" apply --reverse \
  "$CASE_ABS/recovered/source-facing-overlay.patch"

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree(process.argv[1]);
  console.log(JSON.stringify(summary));
' "$RECOVERY_TARGET/src"

git -C "$RECOVERY_TARGET" apply --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
git -C "$RECOVERY_TARGET" apply \
  "$CASE_ABS/recovered/source-facing-overlay.patch"

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree(process.argv[1]);
  console.log(JSON.stringify(summary));
' "$RECOVERY_TARGET/src"

git -C "$RECOVERY_TARGET" apply --reverse --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
```

The intermediate base summary must be 1,957 files, 30,993,723 bytes, framed
SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
The final summary must be 2,022 files, 31,570,676 bytes, framed SHA-256
`c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59`.
The shared tree is already at that target and must remain untouched during the
disposable audit; never apply the overlay there twice.
