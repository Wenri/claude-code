# 2.1.101 → 2.1.104 recovery runbook

This is the reproducible construction and replay procedure for Claude Code
2.1.104 from the verified 2.1.101 base.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.101-to-2.1.104
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

## 1. Prove the adjacent published step

Resolve exact versions, never a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.101 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.104 version dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.102 version --json
pixi run npm view @anthropic-ai/claude-code@2.1.103 version --json
```

Require 2.1.102 and 2.1.103 to be absent from both `versions` and `time` in
the canonical packument, and require their exact version and tarball
endpoints to return 404. The surrounding publication sequence is:

```text
2.1.101  2026-04-10T18:41:55.480Z
2.1.104  2026-04-12T02:26:22.100Z
```

Cross-check official tags:

```sh
git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.101 refs/tags/v2.1.104
```

Both refs must resolve to
`9772e13f820002c9730af67a2409702799c7ddc6`. The pinned changelog has no
2.1.104 section, so retain it as provenance but do not pass it to target
attribution.

Acquire and hash-check all manifest inputs:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

## 2. Authenticate and compare every package member

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.101/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.104/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.101 \
  --target-version 2.1.104 \
  --baseline-shasum 7bfeb26d4a30d1d595238fcc0c77a03578765e4e \
  --target-shasum 2d1dae1e2858e3668794f415f4d3e504ab29baba \
  --baseline-integrity \
    'sha512-abVVCKMDKl9jHzgoUhhBVAQY2fKVdLt13ag5EEDlybRUCRL+rEAZfBxOdQnKZbzH1AUW5VwqiELeMHFauO51DQ==' \
  --target-integrity \
    'sha512-wx/awcAkBN22lQK86DwMrceXLnH9Ljsynd5lMCDMqcKH8LpVgZRyi0ib0KQU1ht0oAfr4/ajtxTlhvtHqPmWZg==' \
  --baseline-signature \
    'MEUCIHQpLCVRpNHYtDtd9exDJA9bNc/HYuiYbvJkW5XuSO14AiEAlN7OuPCD6ozycFxIkQ0tLdBtNRoK31bSQ9C7C5E6hTQ=' \
  --target-signature \
    'MEQCIAhs6NmsuaEaYvk6BKhT/ZWNbRa9/ltLiiTrIafijYT4AiAxoHE0p8jGqqfHLRWEyVU3GYrkWpFJKAeYRIM4XaTcEQ==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.101.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.104.tgz'
```

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`.

## 3. Build the exact adjacent bundle delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
```

Require 1,017,736 bytes and SHA-256
`70e938e84daf3811df350cfc299addec232a2bc94c89595f536624c39dfaa54c`.
The builder must reconstruct and byte-compare the target before succeeding.

## 4. Prove metadata and declarations

`sdk-tools.d.ts` must be byte-identical: 117,378 bytes, SHA-256
`9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe`.
The only package metadata change must be the unique version replacement
2.1.101 → 2.1.104.

## 5. Build exhaustive source attribution

Use 2.1.101 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for source ownership:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.104/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.104/package/sdk-tools.d.ts"
```

Do not add `--changelog`: there is no 2.1.104 section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    2829359772bd3726a6f64fc2960e8161ebf2e308fd50ea9a8f0ae0aaafcd0227 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
```

Require 4,756 source rows, 4,627 target initializers, 39,865 target
partitions, and 13,501,727 / 13,501,727 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    ae8713cb8504c2a48ccc425fefa4856d2b7fb782333a83f29ea8d233f14a6c08 \
  --expected-bytes 1925247 \
  --expected-baseline-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-tokens 4317783 \
  --expected-target-units 18911
```

Every target token must be classified exactly once.

## 7. Generate the readable full-bundle diff

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.101/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.104/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
```

Require metadata SHA-256
`05045ae2af779212ed45de86265869347702a4bc3769339e5c0826bd04e0c479`
and comparison-invariant hash
`598fc015579b0eb0166b707770fe57cccad71379434f6c7a35ffc55eb88ab0fc`.

## 8. Localize only defensible source edits

The generated delta supports two readable owners:

- `src/services/api/client.ts`: byte-level SSE timeout error, transform, fetch
  wrapping, timeout floor/default, and response URL preservation;
- `src/services/api/claude.ts`: event/byte telemetry tiers, byte-timeout
  classification, API abort guard, and partial-yield replay prevention.

Keep the prompt heading bundle-only because its entire preceding experiment
scaffold is absent from the source mirror.

Generate and reverse-check the patch:

```sh
git diff --binary -- \
  src/services/api/client.ts \
  src/services/api/claude.ts \
  > "$CASE/recovered/streaming-idle-and-partial-yield.patch"

git apply --check --reverse \
  "$CASE/recovered/streaming-idle-and-partial-yield.patch"
```

Require 11,791 bytes, SHA-256
`2b1e28f28c8b7e9394881ea5cad167792c097fd0acf3cb418e922fcc6de5fe71`,
149 insertions, and 25 deletions.

## 9. Reconstruct the package and close every gate

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.101/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.101/package.tgz"
```

Require:

```text
status          complete-recovery-verified
bundle bytes    13567412
bundle sha256   ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
package members 20
package bytes   49184019
package sha256  f8ba1d1fce88baa057d762ddd3d1fb0991cf2af28c2d446e3a8fa2bc1d025d8a
source files    1933
semantic tests  4
```

## Semantic source reproduction check

Run the fail-closed semantic audit after acquiring the adjacent artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require all 79 nonmatched units to be classified and zero first-party source
runtime gaps. Although no changed unit is dependency-runtime, missing root
dependency/build inputs keep the whole-bundle-from-source verdict false.
