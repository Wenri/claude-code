# 2.1.105 → 2.1.107 recovery runbook

This is the reproducible construction and replay procedure for Claude Code
2.1.107 from the verified 2.1.105 base. Upstream did not publish 2.1.106.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.105-to-2.1.107
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

## 1. Prove adjacency and acquire immutable inputs

Resolve exact versions rather than a mutable tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.105 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.107 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.105 refs/tags/v2.1.106 refs/tags/v2.1.107
```

Require the publication times and tag commits recorded in the report. Verify
that npm has no 2.1.106 version and Git has no `v2.1.106` tag. Verify that
target commit `194736a4bd11d8329974978abab33019aaad64f1` has sole parent
`550aeecc9780f6334c25d5df7ce1a24830278843`, and pin its one-bullet changelog
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
  --baseline "$RECOVERY_ARTIFACTS/2.1.105/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.107/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.105 \
  --target-version 2.1.107 \
  --baseline-shasum 085ca4b906cb0cf4663cbf46485f7fa34e177ae7 \
  --target-shasum 8f27b1d88d1656de52442547c6e8bdc32161a301 \
  --baseline-integrity \
    'sha512-7lFleszri7+1orZC/doKsWvRJypqWPYN1MEWa30YoMQDnczDFY0UJkypfzK1G8+NalpNZuSdwt2CP8UmotaZ/g==' \
  --target-integrity \
    'sha512-qZ7DJfe0hSGu5dGvmyImZJ94wLPRutOs/DbzNsMkkyj4KP09PKQ0FSFCZhs2FoAeDdil9IedJOaYqtxJhOzQbQ==' \
  --baseline-signature \
    'MEYCIQDFjxQc0i93RuZbWCFosbpz21VxtuQYAgxZrYUThGUF2QIhAL8O2DQrHiMUxF32hdbJfmLfAktFV/2pNGKQ/YItTK3e' \
  --target-signature \
    'MEUCIBP9KiiNQZyh921pfjmAuL8vlen5LWOv7TYWGxUuetEbAiEAgbnHt4//rngNIVjjf8qMqzQfqeOMIS4wKMIefccMMfk=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.105.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.107.tgz'
```

Require 20 baseline and target members, 18 unchanged, exactly two changed,
and no additions, removals, or mode-only changes. The changed set must be
`package/cli.js` and `package/package.json`.

## 3. Build the exact adjacent delta

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
```

Require a 952,059-byte delta with SHA-256
`8fbad613638ebb1c4bddf024a19d99e2cae10df29a3159ad86f5fdf82af459ae`.
The builder must reconstruct and byte-compare its target before succeeding.

## 4. Prove metadata and declarations

Require the package metadata change to be the unique version replacement
2.1.105 → 2.1.107.

Require the baseline and target `sdk-tools.d.ts` files to be byte-identical:
117,636 bytes with SHA-256
`434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928`.

## 5. Build exhaustive source attribution

Use 2.1.105 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for source ownership:

```sh
pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --output "$RECOVERY_WORK/attribution" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.107/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.107/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-194736a4.md" \
  --changelog-section 2.1.107

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$RECOVERY_WORK/attribution" \
  --expected-summary-sha256 \
    43a7fca566276b6d89eaa13f47462daa05df8cbb0b11c17a306bd35ff3ceae6f \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
```

Require 4,756 source rows, 4,664 target initializers, 38,092 target
partitions, and 13,612,212 / 13,612,212 accounted UTF-16 units.

## 6. Build the structural ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    516616ea875c17d81db74f5fbc64ceb5a42e8860be330df48c5ca960c1af3b38 \
  --expected-bytes 1947667 \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-tokens 4354582 \
  --expected-target-units 19123
```

Every target token must be classified exactly once.

## 7. Generate the readable full-bundle diff

```sh
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.105/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.107/package/cli.js" \
  --output "$RECOVERY_WORK/readable-diff" \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$RECOVERY_WORK/readable-diff" \
  --expected-metadata-sha256 \
    af3a3b14069a792bd4f4275c1e9c572e41036a8d193349b632d31da06b186b88 \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
```

Require comparison-invariant hash
`ba679d0cdb699263e1f3dad09b3e0d03f816d951c28e9e877043058bad82c58d`.

## 8. Localize only defensible source edits

The exact bundle supports the three source owners listed in `manifest.json`;
the changelog independently locates the earlier milestone cadence, while the
experiment-gated guidance is target-observable but unchangelogged. Generate
and reverse-check the consolidated patch:

```sh
git diff --binary --unified=1 -- src \
  > "$CASE/recovered/source-facing-overlay.patch"

git apply --check --reverse \
  "$CASE/recovered/source-facing-overlay.patch"
```

Require 3,700 bytes, SHA-256
`da74bdf604858bb15a064cd583ca278469101c26f69b95d19690f45263b6d73e`,
45 insertions, and six deletions.

Keep unsupported authored details bundle-only. Do not turn the one-line
changelog description into invented source. In particular, retain the
`external-build-2211` provenance stamp in the exact bundle delta without
inventing a source-facing owner.

## 9. Reconstruct the package and close every gate

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.105/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.105/package.tgz"
```

Require:

```text
status          complete-recovery-verified
bundle bytes    13678154
bundle sha256   6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
package members 20
package bytes   49295019
package sha256  090976e2da071c4328e567c954cfaeea6dea96cc604e0809f3bdcdc45ac2fe64
source files    1933
semantic tests  5
```
