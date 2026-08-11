# Claude Code 2.1.118 → 2.1.119 recovery runbook

This procedure verifies the exact package and embedded-code recovery, checks
the semantic and source-facing localization, and proves the applied target can
be reversed to the exact 2.1.118 base and replayed to the exact 2.1.119 target.
The checked-out `src/` tree is handed off applied; do not apply the overlay to
it a second time.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.118-to-2.1.119
CASE_ABS=$(realpath "$CASE")
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

Keep both temporary directories for the complete run. Use the versions and
URLs pinned in the manifest; do not acquire through mutable npm tags.

## 1. Verify publication adjacency and acquire artifacts

The expected registry sequence has 2.1.119 immediately after 2.1.118 for both
the wrapper and Linux x64 package. The public Git chain between v2.1.118 and
v2.1.119 has two commits and changes `.claude-plugin/marketplace.json` plus
`CHANGELOG.md` (+55/-1).

Optional live cross-checks:

```sh
for version in 2.1.118 2.1.119; do
  pixi run npm view "@anthropic-ai/claude-code@$version" \
    version time dist --json
  pixi run npm view "@anthropic-ai/claude-code-linux-x64@$version" \
    version time dist --json
done

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.118 refs/tags/v2.1.119
```

Acquire every manifest-pinned artifact and verify its byte length and SHA-256:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

The provenance record additionally freezes npm SHA-1, SHA-512 SRI, ECDSA
signature, public-key ID, publish timestamps, Git objects, and the exact
51-bullet changelog section.

## 2. Verify the wrapper and native Bun container

Regenerate the exhaustive wrapper comparison using the exact registry fields
from [`evidence/provenance.json`](./evidence/provenance.json), then compare it
with the frozen record:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.118/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.119/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.118 \
  --target-version 2.1.119 \
  --baseline-shasum a96c2aa0723f0baaad6df16eb93fb2fb1d3e9a24 \
  --target-shasum a21979a492727b30f9ff2798c14aec49fab6739a \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.118.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.119.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require seven wrapper paths, six unchanged, one changed, no additions or
removals, and 132,031 target member bytes. Only `package/package.json` changes.

Verify the four-member Linux package with the corresponding native package
values from the provenance report. Require two unchanged and two changed
members, 245,230,794 target member bytes, and executable identity:

```text
245230208 bytes
cca43053f062949495596b11b6fd1b59cf79102adb13bacbe66997e6fae41e4a
```

Then verify direct Bun slicing and the independently recovered directory:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five records, pointer bias eight, exact JSC
and content ranges, and analyzable CLI identity:

```text
13720987 bytes
9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef
```

## 3. Regenerate and replay every exact delta

The four checked payloads are deterministic Zstandard dictionary patches. For
each item in [`diff/metadata.json`](./diff/metadata.json), regenerate the
payload and compare it, then apply it and compare the result to the target.
For example:

```sh
generated=$(mktemp -d)
replayed=$(mktemp -d)

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.119-linux-x64/cli.js" \
  --output "$generated/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba \
  --expected-target-sha256 \
    bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e

cmp "$generated/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"

pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.js" \
  "$CASE/diff/cli.js.zstd-delta" \
  -o "$replayed/cli.js" --force

cmp "$replayed/cli.js" \
  "$RECOVERY_ARTIFACTS/2.1.119-linux-x64/cli.js"
```

Repeat for `image-processor.js`, `audio-capture.js`, and wrapper
`package.json`. Fresh payloads must be byte-identical; their total size is
2,355,758 bytes. `sdk-tools.d.ts` and both native addons are unchanged.

Reconstruct the full embedded plain-JavaScript graph:

```sh
pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require three files, 13,726,203 bytes, and the framed-tree identity pinned in
the manifest.

## 4. Verify attribution, structure, and readable review artifacts

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$CASE/attribution" \
  --expected-summary-sha256 \
    "$(sha256sum "$CASE/attribution/summary.json" | cut -d' ' -f1)" \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef
```

Require 58,513 ordered ranges, 13,720,987 accounted UTF-16 units, and zero
unaccounted units.

Use the exact expected bytes and hashes recorded in `manifest.json` for the
structural and readable reports:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$CASE/structural/generated-delta.json.gz" \
  --expected-sha256 "$(sha256sum "$CASE/structural/generated-delta.json.gz" | cut -d' ' -f1)" \
  --expected-bytes "$(wc -c < "$CASE/structural/generated-delta.json.gz")" \
  --expected-baseline-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa \
  --expected-target-sha256 \
    9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef \
  --expected-target-tokens 4312550 \
  --expected-target-units 21893

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$CASE/readable-diff" \
  --expected-metadata-sha256 \
    "$(sha256sum "$CASE/readable-diff/metadata.json" | cut -d' ' -f1)" \
  --expected-baseline-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa \
  --expected-target-sha256 \
    9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef
```

## 5. Verify semantic correspondence and focused tests

The catalog must contain 135 unique obligations: 51 official, 65 hidden or
inherited, and 19 daemon/Fleet/query. It must bind all eight focused test files
and account for 278 target fragments, one target absence, 290 source
assertions, and two source absences (571 evidence records total).
The 84-row `semantic/adjacent-direct-evidence.json` catalog must be exhaustive
and its dedicated suite must verify every exact target/source count and hash.

Regenerate and compare the canonical report:

```sh
pixi run node recovery/scripts/verify-semantic-correspondence.mjs \
  --attribution "$CASE/attribution" \
  --structural "$CASE/structural/generated-delta.json.gz" \
  --obligations "$CASE/semantic/obligations.json" \
  --source-root src \
  --changelog "$CASE/evidence/CHANGELOG-2.1.119.md" \
  --baseline "$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.119-linux-x64/cli.inner.js" \
  --report "$CASE/semantic/semantic-correspondence.json.gz" \
  --summary "$CASE/semantic/summary.json"
```

Run the target-focused suites:

```sh
CLAUDE_CODE_2_1_118_BUNDLE="$RECOVERY_ARTIFACTS/2.1.118-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_119_BUNDLE="$RECOVERY_ARTIFACTS/2.1.119-linux-x64/cli.inner.js" \
  pixi run node --test recovery/test/recovery-2.1.119-*.test.mjs
```

Require 86/86. The manifest also retains the four 2.1.118 suites; run them
with their pinned 2.1.117/2.1.118 bundles and `CLAUDE_CODE_SOURCE_ROOT=src`,
and require 21/21.

## 6. Verify the immutable source freeze

The frozen directory is self-verifying:

```sh
(
  cd "$CASE/recovered/source-freeze"
  sha256sum -c SHA256SUMS
)

cmp "$CASE/recovered/source-facing-overlay.patch" \
  "$CASE/recovered/source-freeze/source-facing-overlay.patch"
```

The canonical overlay is 2,709,667 bytes with SHA-256
`623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794`.

The checked-out tree is the applied target. Confirm orientation without
changing it:

```sh
git apply --reverse --check "$CASE_ABS/recovered/source-facing-overlay.patch"
if git apply --check "$CASE_ABS/recovered/source-facing-overlay.patch" 2>/dev/null; then
  echo 'unexpected: forward patch still applies' >&2
  exit 1
fi
```

Verify full lineage in place:

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

The verifier must reproduce these source summaries:

| Orientation | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Base 2.1.118 | 2,022 | 31,570,676 | `c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59` |
| Target 2.1.119 | 2,088 | 32,357,579 | `5b91f7f3ddcdf440a8ef22b7e43eec769402aa54c3f1995ee508adb0c9157882` |

The five allowlisted trailing spaces are authenticated prompt bytes. Any
additional `git diff --check` diagnostic is a failure.

## 7. Run the aggregate complete gate

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.118/package.tgz" \
  --repo .
```

Require all eleven named checks and aggregate status
`complete-recovery-verified`.

## 8. Optional destructive reversibility audit

Perform this only in a disposable worktree created at the exact base commit:

```sh
AUDIT=$(mktemp -d)
git worktree add --detach "$AUDIT" bd846a24e3886322888f02b9f747c132a4a32314

git -C "$AUDIT" apply --index "$CASE_ABS/recovered/source-facing-overlay.patch"
git -C "$AUDIT" apply --reverse --check \
  "$CASE_ABS/recovered/source-facing-overlay.patch"

git -C "$AUDIT" apply --reverse --index \
  "$CASE_ABS/recovered/source-facing-overlay.patch"
test "$(git -C "$AUDIT" write-tree)" = \
  695e9409899f783a90899d5ff7b06cef0129b7e0

git -C "$AUDIT" apply --index "$CASE_ABS/recovered/source-facing-overlay.patch"
test "$(git -C "$AUDIT" write-tree)" = \
  bceb0af2f6b5261fab23b9d8fee51cf48f1b2dd2
```

Finish at the target. Remove the disposable worktree only after the complete
gate passes.
