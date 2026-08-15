# 2.1.104 → 2.1.105 recovery runbook

This is the reproducible construction and replay procedure for Claude Code
2.1.105 from the verified 2.1.104 base.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.104-to-2.1.105
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

## 1. Prove adjacency and acquire immutable inputs

Resolve exact versions rather than a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.104 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.105 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.104 refs/tags/v2.1.105
```

Require the publication times and tag commits recorded in the report. Verify
that target commit
`550aeecc9780f6334c25d5df7ce1a24830278843` has sole parent
`9772e13f820002c9730af67a2409702799c7ddc6`, and pin its 37-bullet changelog
section.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.104/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.104 \
  --target-version 2.1.105 \
  --baseline-shasum 2d1dae1e2858e3668794f415f4d3e504ab29baba \
  --target-shasum 085ca4b906cb0cf4663cbf46485f7fa34e177ae7 \
  --baseline-integrity \
    'sha512-wx/awcAkBN22lQK86DwMrceXLnH9Ljsynd5lMCDMqcKH8LpVgZRyi0ib0KQU1ht0oAfr4/ajtxTlhvtHqPmWZg==' \
  --target-integrity \
    'sha512-7lFleszri7+1orZC/doKsWvRJypqWPYN1MEWa30YoMQDnczDFY0UJkypfzK1G8+NalpNZuSdwt2CP8UmotaZ/g==' \
  --baseline-signature \
    'MEQCIAhs6NmsuaEaYvk6BKhT/ZWNbRa9/ltLiiTrIafijYT4AiAxoHE0p8jGqqfHLRWEyVU3GYrkWpFJKAeYRIM4XaTcEQ==' \
  --target-signature \
    'MEYCIQDFjxQc0i93RuZbWCFosbpz21VxtuQYAgxZrYUThGUF2QIhAL8O2DQrHiMUxF32hdbJfmLfAktFV/2pNGKQ/YItTK3e' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.104.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.105.tgz'
```

Require 20 baseline and target members, 17 unchanged, exactly three changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js`, `package/package.json`, and `package/sdk-tools.d.ts`.

## 3. Build exact adjacent deltas

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.104/package/sdk-tools.d.ts" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package/sdk-tools.d.ts" \
  --output "$RECOVERY_WORK/sdk-tools.d.ts.zstd-delta" \
  --expected-baseline-sha256 \
    9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe \
  --expected-target-sha256 \
    434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928
```

Require:

```text
cli delta   2,157,702 bytes  615daafb1b4c92d98e9339ee8d9c40104fed840eb1c2b2b64186cf30823f24f0
d.ts delta        161 bytes  524facc8fdf17509decbfab10e21dac1dce89808d5d665608839ab98316e33b6
```

Each builder must reconstruct and byte-compare its target before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.104 → 2.1.105.

Apply the one ordered declaration replacement recorded in
`manifest.json`. The baseline `EnterWorktreeInput` block must occur exactly
once, and the result must be the complete 117,636-byte target declaration
file with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

## 5. Build exhaustive source attribution

Use 2.1.104 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for source ownership:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.105/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.105/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-550aeecc.md" \
  --changelog-section 2.1.105

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    733825c9962b38fbb8e283e080f41008b894c10bee502dc44fe0eae4805fe9bb \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75
```

Require 4,756 source rows, 4,664 target initializers, 38,092 target
partitions, and 13,610,973 / 13,610,973 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    097500c4e061f4dc859da240978d2047abd0ef38966817effbcc5c00df09b68a \
  --expected-bytes 2314608 \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-tokens 4354381 \
  --expected-target-units 19120
```

Every target token must be classified exactly once.

## 7. Generate the readable full-bundle diff

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$RECOVERY_WORK/readable-diff" \
  --expected-metadata-sha256 \
    46d02c158b67554758efab2cf57677031359585c641d8b5de2e57171723b5822 \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75
```

Require comparison-invariant hash
`b3f6ebf80ab8b5583de5eb890bde5e383e202c86d2e805c2a1e5610fe5cfeaa0`.

## 8. Localize only defensible source edits

The exact bundle and changelog support the 28 source owners listed in
`manifest.json`. Generate and reverse-check the consolidated patch:

```sh
git diff --binary --unified=1 -- src \
  > "$CASE/recovered/source-facing-overlay.patch"

git apply --check --reverse \
  "$CASE/recovered/source-facing-overlay.patch"
```

Require 396,606 bytes, SHA-256
`f5c8a43b2794c2e1d413ad54b48b256f7404bc9a9cd0a94ceceb5f7da8c918f7`,
462 insertions, and 231 deletions.

Keep broader changes bundle-only where the exact target source boundary is
not observable. Do not turn changelog prose into invented source.

## 9. Reconstruct the package and close every gate

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.104/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.104/package.tgz"
```

Require:

```text
status          complete-recovery-verified
bundle bytes    13676915
bundle sha256   8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75
package members 20
package bytes   49293780
package sha256  eb72a564decf7f00f8ba598bc7d3d8ecec452d1f220ff07e1fbcafd7184e110a
source files    1933
semantic tests  10
```

## Semantic source reproduction check

Run the fail-closed semantic audit after acquiring the adjacent artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require all 5,643 nonmatched units to be classified, zero first-party source
runtime gaps, and 24 explicitly unresolved dependency-runtime gaps. Missing
root dependency/build inputs keep the whole-bundle-from-source verdict false.
