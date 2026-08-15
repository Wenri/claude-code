# 2.1.113 → 2.1.114 recovery runbook

This is the reproducible construction, extraction, localization, replay, and
source-handoff procedure for Claude Code 2.1.114 from the adjacent verified
2.1.113 release. Both releases use a thin npm wrapper and a per-platform Bun
native executable, so the adjacent generated comparison uses canonical raw
slices from the two authenticated Linux x64 executables.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.113-to-2.1.114
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

Keep the temporary paths for the duration of the run. Do not run the
memory-intensive readable-diff generator concurrently with attribution on a
small host.

## 1. Prove adjacency and pin immutable publications

Resolve exact versions, never mutable npm tags:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.113 \
  version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.114 \
  version time dist --json
pixi run npm view @anthropic-ai/claude-code-linux-x64@2.1.113 \
  version time dist --json
pixi run npm view @anthropic-ai/claude-code-linux-x64@2.1.114 \
  version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.113 refs/tags/v2.1.114

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.114
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -2 FETCH_HEAD
git -C "$UPSTREAM_GIT" diff --stat FETCH_HEAD^ FETCH_HEAD
```

Require target publication times `2026-04-17T23:24:28.107Z` for Linux x64
and `2026-04-17T23:26:20.555Z` for the wrapper. The tags must resolve to
`71366ecf5dd9103a46537eab8607a2a3c0637577` and
`0385848b4e737831fc3b973d9a78d31950a87d9d`, with the latter directly naming
the former as its parent. Require target tree
`330d0d87da792c88da71599c5be1dcef31a5bd9e` and a public diff limited to
`CHANGELOG.md`.

Acquire every manifest artifact and verify its declared byte length and
SHA-256:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This acquires both wrapper tarballs, both Linux x64 packages and executables,
all declared executable slices, the 2.1.88 source-oracle bundle/map, and the
pinned official changelog. The target wrapper and platform tarballs must also
pass the SHA-1, SHA-512 SRI, and registry signatures recorded in
`evidence/provenance.json`.

## 2. Compare and reconstruct the wrapper package

Re-run the exhaustive signed tar-member comparison. The pinned signature and
registry values below deliberately duplicate the immutable evidence:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.114/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.113 \
  --target-version 2.1.114 \
  --baseline-shasum 328c2679ae7b862e436c62c66807adb2f89be937 \
  --target-shasum 42f8b092074c60ad2b2724a12bc37b49661fdb7b \
  --baseline-integrity \
    'sha512-RHeZ8rxKNcgtxJ+pVl5qGlyOXFejLVMiL/OXCwRy4yjbpUfZfcgqzcqke8++Qw4ewelykcMZYtTolbU+ounvog==' \
  --target-integrity \
    'sha512-RPhw1ClFxzOESQdI+bXYp35IXlhS/bi75VIajQgrg11qH10k5jiYZ+ivz1dTN6rbeii+zaCuhjpMzKfdtN/JTw==' \
  --baseline-signature \
    'MEYCIQD1PCoUxnVOa3vNXJFO+DCMnZxg9gBfNSHLZCog98XgZgIhALyDNU+bXnP/nMdO9LDnVfhwEy5zcBYtpJK5cYrRmIQO' \
  --target-signature \
    'MEUCIQDDUct0DwoTDULvyS/d+FXylAJuQjO+y2covAfO1MnXlAIgWBNn35SrCIUWS1bxNZI8ycsHOcWrPXc7AZbygvpwlEg=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.113.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.114.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require seven paths on each side, six unchanged, one changed, no additions or
removals, and 132,292 target member bytes. The changed member must be
`package/package.json`.

Rebuild its deterministic dictionary patch with the repository's exact-delta
driver and the pinned Zstandard 1.5.7 implementation:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113/package/package.json" \
  --target "$RECOVERY_ARTIFACTS/2.1.114/package/package.json" \
  --output "$RECOVERY_WORK/package.json.zstd-delta" \
  --expected-baseline-sha256 \
    5f0b160393bd4274b22cf290ea8e9ec38c952ad8be50a0ce6c9ccb06fd1bc64c \
  --expected-target-sha256 \
    78cbd794a41f04d752ad58a13833fc6234e18c6b7c8012606d5327a2dcbe8fee

cmp "$RECOVERY_WORK/package.json.zstd-delta" \
  "$CASE/diff/package.json.zstd-delta"
```

Replay all seven members and byte-compare the result with the signed target:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.113/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"
```

Require seven files, 132,292 bytes, and framed-tree SHA-256
`39c4b7cbbdcb93f859ae5d869c0d787bb79a82ede36148f1d6da064b8d675a2d`.

## 3. Authenticate both native inputs

The manifest pins both platform tarballs and executable members:

```sh
sha256sum \
  "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package/claude" \
  "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package/claude"
```

Require, in order:

```text
0b703a2b15e2988138b1b8d86e73228ee2aab00253ac21ffcdc828becb42d010
a81f7726b3b6b910e50c08a09f0090cb60714695d6d01bfe8698ff16cda9b87d
c1123db5ac5003185686866f7431cc9c831e92c286bba2104382ca4403230195
12bd4b0916deb06be17ffc7b2f0485e140bf00b2db3dcb78469d66723d73c27f
```

Regenerate the adjacent native member inventory with the same signed-package
comparator and byte-compare it with the checked-in report:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package.tgz" \
  --output "$RECOVERY_WORK/native-package-members.json" \
  --package-name @anthropic-ai/claude-code-linux-x64 \
  --baseline-version 2.1.113 \
  --target-version 2.1.114 \
  --baseline-shasum 62a7c9d9d5c2a42116c1e689e0fd88cd63f5edad \
  --target-shasum c505e20dfeaef08d36d67ea5e8a6f9526e0366a0 \
  --baseline-integrity \
    'sha512-C2evSiNGVGKlCOxNYk4t/DMFGWApnzwiTKfcMD7MzIU5G8JxSIRz7NylAPq0Dyt16wlNj2Vug2aY0VyrGaDueg==' \
  --target-integrity \
    'sha512-4YX0ataEGqtgmXoYf97YQnbzh0xwegH4ZFP5d5LXBlJIXAB26cSIBNBPE+Eln8evguGJ9QzmHQBhSTdOl0DQAw==' \
  --baseline-signature \
    'MEYCIQCAiXKjHceWhkq7UZHEoYM+5e/T/WjK/dHaJJIkogcxbwIhAM8gMLSl2FMnK2afxJsPOiDX0HsH2F0Yul6oVJlUjY+8' \
  --target-signature \
    'MEQCIBUc5n0113sX+OaDURxEpDV6GrFo1vEbpCUK/v2BKty4AiB4vU61pMKtPlnenvic+PaOXdfySrw2pNTBvgbmTudNug==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.113.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.114.tgz'

cmp "$RECOVERY_WORK/native-package-members.json" \
  "$CASE/binary-extraction/native-package-members.json"
```

The checked-in adjacent native inventory authenticates all four members on
both sides. `LICENSE.md` and `README.md` are unchanged; `package/claude` and
`package/package.json` change. The inventory proves adjacent package topology
and bytes, but does not claim the target ELF is reconstructed from its
predecessor.

## 4. Discover and freeze the target Bun graph

`bun_graph` is optional and external to this repository. The historical run
used an operator-supplied file at `/home/coder/.local/bin/bun_graph`, 706,304
bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
The installed binary references Nix runtime libraries, so the historical run
used these cached closures and invoked the loader explicitly from
source-highlight's data directory:

```sh
BUN_GRAPH_BIN=/home/coder/.local/bin/bun_graph
BUN_GRAPH_STORE=/home/coder/.local/share/nix/root/nix/store
BUN_GRAPH_GLIBC="$BUN_GRAPH_STORE/34dkjp1wxxh6djsvxk8nhvzp0izasds0-glibc-2.42-67"
BUN_GRAPH_SOURCE="$BUN_GRAPH_STORE/riw3c5rgrwf4kx77l4ypirx9gznac11i-source-highlight-3.1.9"
BUN_GRAPH_BOOST="$BUN_GRAPH_STORE/dagkv8nn3pymscs57684q1kziywbpz9v-boost-1.89.0"
BUN_GRAPH_GCC="$BUN_GRAPH_STORE/n35z8vvlr7c5k1406n5bwd0f8h2hgj1j-gcc-15.2.0-lib"
BUN_GRAPH_LIBGCC="$BUN_GRAPH_STORE/gahh8gqhwhpfnl8j1j34ggk7440kmvni-gcc-15.2.0-libgcc"
BUN_GRAPH_ICU="$BUN_GRAPH_STORE/lqgjp22sgdj4yclcywz45brp2clf7399-icu4c-76.1"
BUN_GRAPH_LIBS="$BUN_GRAPH_SOURCE/lib:$BUN_GRAPH_BOOST/lib:$BUN_GRAPH_GCC/lib:$BUN_GRAPH_LIBGCC/lib:$BUN_GRAPH_ICU/lib:$BUN_GRAPH_GLIBC/lib"

( cd "$BUN_GRAPH_SOURCE/share/source-highlight" && \
  "$BUN_GRAPH_GLIBC/lib/ld-linux-x86-64.so.2" \
    --library-path "$BUN_GRAPH_LIBS" \
    "$BUN_GRAPH_BIN" \
    "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package/claude" \
  > "$RECOVERY_WORK/bun-graph.txt" )

cmp "$RECOVERY_WORK/bun-graph.txt" \
  "$CASE/binary-extraction/bun-graph.txt"
```

If the exact binary or its ABI-compatible Nix closures are unavailable, skip
discovery replay. Exact recovery uses the checked-in, hash-pinned output only
as discovery evidence. Canonical bytes come from direct manifest slices and
the independent verifier.

The target `.bun` section is at file offset 108,085,248, length 128,320,349.
Interpret each displayed `StringPointer` as:

```text
actual file offset = 108085248 + displayed offset + 8
length             = displayed length
```

The target raw CLI begins at 221,462,232 and is 12,986,845 bytes. Strip exactly
87 prefix bytes and three suffix bytes only for analysis:

```sh
dd if="$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package/claude" \
  of="$RECOVERY_WORK/cli.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=221462232 count=12986845 status=none

dd if="$RECOVERY_WORK/cli.js" of="$RECOVERY_WORK/cli.inner.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=87 count=12986755 status=none

sha256sum "$RECOVERY_WORK/cli.js" "$RECOVERY_WORK/cli.inner.js"
pixi run node --check "$RECOVERY_WORK/cli.inner.js"
```

Require hashes `5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83`
and `cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16`.
Repeat for the baseline and both releases' helper-JS slices declared in the
manifest.

Independently reparse the target container:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five module records, and every range and hash
from `binary-extraction/inventory.json`.

## 5. Rebuild exact embedded-JavaScript payloads

Build the adjacent raw CLI patch:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681 \
  --expected-target-sha256 \
    5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Build the two helper dictionary patches with the same exact-delta driver:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/image-processor.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/image-processor.js" \
  --output "$RECOVERY_WORK/image-processor.js.zstd-delta" \
  --expected-baseline-sha256 \
    33c464d78edc6c2cc292e75691f3a75360c947036d4516fda4b8eea2b8717c96 \
  --expected-target-sha256 \
    3584c57d2720cfb8737009a2aa95f9ce0ec84d1b9512c238815a6ac088e7d346

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/audio-capture.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/audio-capture.js" \
  --output "$RECOVERY_WORK/audio-capture.js.zstd-delta" \
  --expected-baseline-sha256 \
    932257e6b4a9013c695c7d2b1b6d56e34e0a9aab5c56eac3748d67db5ac1c534 \
  --expected-target-sha256 \
    78b3c02e7e21fd59a59691381d04c5a1c562719c3bbe9697e945ae05f49526ad

cmp "$RECOVERY_WORK/image-processor.js.zstd-delta" \
  "$CASE/diff/image-processor.js.zstd-delta"
cmp "$RECOVERY_WORK/audio-capture.js.zstd-delta" \
  "$CASE/diff/audio-capture.js.zstd-delta"
```

Replay and verify the complete embedded JavaScript graph:

```sh
pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require three files, 12,991,971 bytes, and framed-tree SHA-256
`d2b3dcfaa0d29fc54e22bfebb77f307d5fc357058258a92dc84c3585799a983f`.

## 6. Rebuild exhaustive accounting ledgers

Use the exact 2.1.88 bundle/map pair only for historical source ownership:

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.inner.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.114/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.114/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-0385848b.md" \
  --changelog-section 2.1.114

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    c998d4735ec13827c11a587d34c80e71ef20d0b613e8116a727f3d3891913f3b \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 12,986,755 accounted target UTF-16 code units and zero unaccounted.

Compare the adjacent analyzable CLI interiors for structure and readability:

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.inner.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    7c8388ac99c3ae3e777a2e0bc3f84a5c929818d070d071fcf3939ea5072942e8 \
  --expected-bytes 2051468 \
  --expected-baseline-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-tokens 4051256 \
  --expected-target-units 20447

READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.inner.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16

cmp "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
cmp "$READABLE_REGEN/metadata.json" \
  "$CASE/readable-diff/metadata.json"
cmp "$READABLE_REGEN/normalized.diff.gz" \
  "$CASE/readable-diff/normalized.diff.gz"
cmp "$READABLE_REGEN/statements.diff" \
  "$CASE/readable-diff/statements.diff"
cmp "$READABLE_REGEN/renames.tsv" \
  "$CASE/readable-diff/renames.tsv"

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    16a37c5d9a021b19973a54317acd6b9249be02d866c1f1ae52113ae6d362f8cf \
  --expected-baseline-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16
```

Require 20,447 target structural units and 4,051,256 target tokens, all
classified. The readable comparison invariant hashes must remain equal.

## 7. Localize the source-facing change

Normalize only the exact release metadata observed on both sides:

```text
2.1.113                 → 2.1.114
2026-04-17T18:18:28Z    → 2026-04-17T22:37:24Z
```

The normalized generated interiors then differ only at the permission logging
accessor:

```text
getAppState().toolPermissionContext.mode
getAppState?.()?.toolPermissionContext.mode
```

The cumulative source mirror had not yet localized the baseline bundle's
existing `permissionMode` telemetry. The source-facing overlay therefore
closes that inherited localization gap and adds the actual adjacent optional
chain. Only the latter is asserted as the 2.1.113→2.1.114 generated-code
change. From the verified 2.1.113 source base, replay the source-only patch and
prove the resulting diff has no paths outside `src/`:

```sh
git apply --check "$CASE/recovered/source-facing-overlay.patch"
git apply "$CASE/recovered/source-facing-overlay.patch"

git diff --src-prefix=a/ --dst-prefix=b/ -- \
  src/components/permissions/hooks.ts \
  > "$RECOVERY_WORK/source-facing-overlay.patch"

cmp "$RECOVERY_WORK/source-facing-overlay.patch" \
  "$CASE/recovered/source-facing-overlay.patch"
```

With the patch applied, the target source summary must be 1,950 files,
30,868,629 bytes, SHA-256
`45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0`.
The source-lineage verifier reverse-applies it to the exact 2.1.113 base,
reapplies it, syntax-builds the changed source, byte-compares both trees, and
runs `recovery/test/recovery-2.1.114-permission-dialog.test.mjs` against the
authenticated adjacent analyzable bundles.

## 8. Run the complete gate

Step 7 leaves the repository source in the applied 2.1.114 overlay state
required by this gate:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.113/package.tgz" \
  --repo .
```

Require these statuses:

```text
evidence-verified
bun-container-verified
source-lineage-verified
source-reproduction-audit-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
readable-diff-verified
embedded-code-reconstructed
exact-package-tree-reconstructed
```

## 9. Preserve the applied handoff state

The completed recovery keeps the source tree on the applied 2.1.114-facing
target. Confirm that the archived patch can still reverse cleanly without
changing the tree:

```sh
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"
```

Do not reverse the overlay during the final handoff. The expected applied
summary is 1,950 files, 30,868,629 bytes, SHA-256
`45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0`.
Use the reverse operation only for a deliberate rollback to the verified
2.1.113 base; do not reverse any cumulative pre-2.1.114 overlays.
