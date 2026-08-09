# 2.1.114 → 2.1.116 recovery runbook

This is the reproducible acquisition, extraction, reconstruction, accounting,
source-localization, and handoff procedure for Claude Code 2.1.116 from the
adjacent verified 2.1.114 release. Version 2.1.115 was never published. Both
available releases use a thin npm wrapper and a per-platform Bun executable,
so canonical generated code comes from direct slices of authenticated Linux
x64 executables.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.114-to-2.1.116
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

Keep both temporary paths for the full run. Do not run the memory-intensive
readable-diff generator concurrently with attribution on a small host.

## 1. Prove publication adjacency

Resolve exact versions, not mutable npm tags:

```sh
for version in 2.1.114 2.1.115 2.1.116; do
  pixi run npm view "@anthropic-ai/claude-code@$version" \
    version time dist --json || true
done

pixi run npm view @anthropic-ai/claude-code-linux-x64@2.1.114 \
  version time dist --json
pixi run npm view @anthropic-ai/claude-code-linux-x64@2.1.116 \
  version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.114 refs/tags/v2.1.115 refs/tags/v2.1.116

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.116
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -2 FETCH_HEAD
git -C "$UPSTREAM_GIT" diff --stat FETCH_HEAD^ FETCH_HEAD
```

Require all of the following:

- 2.1.115 is absent from npm and `v2.1.115` is absent upstream.
- 2.1.116 is the next registry version after 2.1.114.
- Target Linux x64 and wrapper publication times are respectively
  `2026-04-20T19:22:57.666Z` and `2026-04-20T19:24:52.313Z`.
- Target commit `fe53778ed90fd971bf4ec78fa1f65ccf0536352f` directly names
  2.1.114 commit `0385848b4e737831fc3b973d9a78d31950a87d9d` as its parent.
- The target tree is `4708245c1a69a70166aae3b53da3f3ab7ee52536` and the public diff
  changes only `CHANGELOG.md`.

Acquire every manifest artifact and verify byte lengths and SHA-256 hashes:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This downloads both wrappers, both Linux x64 packages, the 2.1.88 source
oracle, and the pinned upstream changelog; extracts declared archive members;
and materializes every canonical executable slice.

## 2. Authenticate and compare wrapper packages

Rebuild the exhaustive signed member inventory:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.114/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.116/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.114 \
  --target-version 2.1.116 \
  --baseline-shasum 42f8b092074c60ad2b2724a12bc37b49661fdb7b \
  --target-shasum 27abb10e16fcb2ee5236a60ec07fa3aa68dd4121 \
  --baseline-integrity \
    'sha512-RPhw1ClFxzOESQdI+bXYp35IXlhS/bi75VIajQgrg11qH10k5jiYZ+ivz1dTN6rbeii+zaCuhjpMzKfdtN/JTw==' \
  --target-integrity \
    'sha512-4QGIIgpfZIznRqlMpEbn5lz8HyGaU+WZND+MGo4sCdMfGBwJPQ5OyXaiA8zhgFtlGW5iWAbYR5CpjQhrvCFeCw==' \
  --baseline-signature \
    'MEUCIQDDUct0DwoTDULvyS/d+FXylAJuQjO+y2covAfO1MnXlAIgWBNn35SrCIUWS1bxNZI8ycsHOcWrPXc7AZbygvpwlEg=' \
  --target-signature \
    'MEQCIGTbqRDUR0z7WA3cwr2Wwh/yxO1g2S5QC4xu5vtf7QhnAiA7j8WvPyIYj36a1vRMR3qz72wQN/FnUunYPb8fcEUWWg==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.114.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.116.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require seven paths, four unchanged, three changed, no additions, removals,
or mode-only changes, and 132,486 target member bytes. The changed paths must
be `package/install.cjs`, `package/package.json`, and
`package/sdk-tools.d.ts`.

Regenerate all three deterministic wrapper patches:

```sh
for spec in \
  'install.cjs 65bc65f48812b25124dc49e3c08b0264c70c0485333fa736a280f6a1c4e7a98a 574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2' \
  'package.json 78cbd794a41f04d752ad58a13833fc6234e18c6b7c8012606d5327a2dcbe8fee 7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931' \
  'sdk-tools.d.ts 98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc'
do
  set -- $spec
  name=$1
  baseline_sha=$2
  target_sha=$3
  pixi run node recovery/scripts/build-exact-delta.mjs \
    --baseline "$RECOVERY_ARTIFACTS/2.1.114/package/$name" \
    --target "$RECOVERY_ARTIFACTS/2.1.116/package/$name" \
    --output "$RECOVERY_WORK/$name.zstd-delta" \
    --expected-baseline-sha256 "$baseline_sha" \
    --expected-target-sha256 "$target_sha"
  cmp "$RECOVERY_WORK/$name.zstd-delta" \
    "$CASE/diff/$name.zstd-delta"
done
```

The target declarations must also equal the baseline plus one exact insertion
after the unique `staleReadFileStateHint?: string;` anchor. The inserted 139
bytes document and declare `ghRateLimitHint?: string`. Package replay consumes
the checked `sdk-tools.d.ts` dictionary payload as the byte-exact recipe, while
the independent semantic assertion proves the same authenticated target from
the exact insertion. Changed-member payload precedence prevents a declaration
assertion from bypassing or leaving the checked payload unused.

Reconstruct and byte-compare every wrapper member:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.114/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"
```

Require seven files, 132,486 bytes, and framed-tree SHA-256
`5cf546a554e481b32f4633be6f883c8740b05f34a359142e9665a591011e90c0`.

## 3. Authenticate both native inputs

```sh
sha256sum \
  "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package/claude" \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package/claude"
```

Require, in order:

```text
c1123db5ac5003185686866f7431cc9c831e92c286bba2104382ca4403230195
12bd4b0916deb06be17ffc7b2f0485e140bf00b2db3dcb78469d66723d73c27f
0dde548c698cee7174751a92426123e90a95f56bf09271423681dd883d8bf0ea
0d1aea5ce056a5ce491da7e9bbe63f992585e5c24852f023a07c8f18cf292cc5
```

Regenerate the signed native member inventory:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package.tgz" \
  --output "$RECOVERY_WORK/native-package-members.json" \
  --package-name @anthropic-ai/claude-code-linux-x64 \
  --baseline-version 2.1.114 \
  --target-version 2.1.116 \
  --baseline-shasum c505e20dfeaef08d36d67ea5e8a6f9526e0366a0 \
  --target-shasum 70fc945e30491431f44e546f12e300bdc2c8c902 \
  --baseline-integrity \
    'sha512-4YX0ataEGqtgmXoYf97YQnbzh0xwegH4ZFP5d5LXBlJIXAB26cSIBNBPE+Eln8evguGJ9QzmHQBhSTdOl0DQAw==' \
  --target-integrity \
    'sha512-XLlgIItxdjhr4DpSNx7eWmNtVWeCqRtaXoly58lFObpyU1Fq3HAbY//+nmqVirWKFK2BjVXLa/iq9y64+SZ4kg==' \
  --baseline-signature \
    'MEQCIBUc5n0113sX+OaDURxEpDV6GrFo1vEbpCUK/v2BKty4AiB4vU61pMKtPlnenvic+PaOXdfySrw2pNTBvgbmTudNug==' \
  --target-signature \
    'MEUCIQDvTHFfWSO9iE5GbTsSrC3IrbuZffbJpU8P64f0E0avWgIgW3V4nNrUETut7o2s9T6EkuYUEiV776iXLHOTX2b+l+w=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.114.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.116.tgz'

cmp "$RECOVERY_WORK/native-package-members.json" \
  "$CASE/binary-extraction/native-package-members.json"
```

Require four target members and 237,653,194 bytes; `LICENSE.md` and
`README.md` are unchanged, while `claude` and `package.json` change. The
target framed-tree hash is
`82c0a00eea042ff53e6071400a401e375ae2df4904cce9ff914f7978af75d206`.

## 4. Discover and independently verify the Bun graph

`bun_graph` is optional and external. The historical discovery binary was
706,304 bytes, SHA-256
`aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767`.
Its installed build uses cached Nix libraries:

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
    "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package/claude" \
  > "$RECOVERY_WORK/bun-graph.txt" )

cmp "$RECOVERY_WORK/bun-graph.txt" \
  "$CASE/binary-extraction/bun-graph.txt"
```

If the tool or closures are unavailable, skip discovery replay. Canonical
recovery does not trust its rewritten extraction: manifest slices and the
independent parser are authoritative.

The `.bun` section begins at 108,085,248. The pointer rule is:

```text
actual file offset = 108085248 + displayed pointer offset + 8
length             = displayed length
```

Directly reproduce the CLI and analyzable interior:

```sh
dd if="$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package/claude" \
  of="$RECOVERY_WORK/cli.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=222590792 count=13102362 status=none

dd if="$RECOVERY_WORK/cli.js" of="$RECOVERY_WORK/cli.inner.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=87 count=13102272 status=none

sha256sum "$RECOVERY_WORK/cli.js" "$RECOVERY_WORK/cli.inner.js"
pixi run node --check "$RECOVERY_WORK/cli.inner.js"
```

Require hashes `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193`
and `d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a`.
The manifest similarly declares the two helper JavaScript files, the
114,505,344-byte JSC cache, and both native addons.

Independently reparse and verify all five records:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five module records, exact set equality for
all three JavaScript artifacts and all five content records, and every range
and hash from `binary-extraction/inventory.json`.

## 5. Regenerate exact embedded-JavaScript payloads

```sh
for spec in \
  'cli.js 5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83 06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193' \
  'image-processor.js 3584c57d2720cfb8737009a2aa95f9ce0ec84d1b9512c238815a6ac088e7d346 002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e' \
  'audio-capture.js 78b3c02e7e21fd59a59691381d04c5a1c562719c3bbe9697e945ae05f49526ad e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3'
do
  set -- $spec
  name=$1
  baseline_sha=$2
  target_sha=$3
  pixi run node recovery/scripts/build-exact-delta.mjs \
    --baseline "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/$name" \
    --target "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/$name" \
    --output "$RECOVERY_WORK/$name.zstd-delta" \
    --expected-baseline-sha256 "$baseline_sha" \
    --expected-target-sha256 "$target_sha"
  cmp "$RECOVERY_WORK/$name.zstd-delta" \
    "$CASE/diff/$name.zstd-delta"
done

pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require three files, 13,107,488 bytes, and framed-tree SHA-256
`e0f43f765bb8cf903dfda2bdfe0feb7549d5a4b9b4202de61c4bd9b21df97190`.

## 6. Regenerate exhaustive accounting ledgers

Use the exact 2.1.88 bundle/map pair only for historical source ownership.
The full pinned changelog is required; using the section-only file changes the
generated summary and is not a reproducible substitute.

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.inner.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.116/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.116/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-fe53778e.md" \
  --changelog-section 2.1.116

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    254f5c3cc09545b7ef46336a626a9d1009f297dbaf4cee55a319c978039883a9 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a

for name in summary.json sources.jsonl.gz target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 13,102,272 accounted target UTF-16 units and zero unaccounted.

Regenerate the adjacent structural ledger:

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.inner.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    77ae38f5e31dc5ac6eac074f18253d4c67b20fa8a07e00d3caf31519af44fb16 \
  --expected-bytes 2410825 \
  --expected-baseline-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-tokens 4093279 \
  --expected-target-units 20734

cmp "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Regenerate the readable comparison with sufficient heap:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff"
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.114-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.inner.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a

for name in metadata.json normalized.diff.gz statements.diff renames.tsv; do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    91c3964bcfc1f21a5ba717f4361f321d33c74017f02e5803e445e4819ec91890 \
  --expected-baseline-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a
```

Require 20,734 target structural units and 4,093,279 target tokens, all
classified. The readable comparison invariant hashes must remain equal.

## 7. Replay and verify the source-facing overlay

The normal repository handoff already carries the applied 2.1.116 target; do
not apply the overlay to it a second time. For a clean-room replay, start from
commit `f7d9656548fd1e7849a9e243d9950dbb7307690c`, whose `src` Git tree is
`fd5c4c4e04b12590984af6eeeb9ce2ecec157c2f`, while retaining this recovery
case outside that disposable checkout. The baseline source summary is 1,950
files, 30,868,629 bytes, framed SHA-256
`45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0`.

Apply only this case's forward patch:

```sh
git diff --exit-code -- src
git diff --cached --exit-code -- src
test "$(git rev-parse HEAD:src)" = \
  fd5c4c4e04b12590984af6eeeb9ce2ecec157c2f

git apply --check "$CASE/recovered/source-facing-overlay.patch"
git apply "$CASE/recovered/source-facing-overlay.patch"

git ls-files --others --exclude-standard -z -- src |
  xargs -0 -r git add --intent-to-add --
git diff --full-index --src-prefix=a/ --dst-prefix=b/ -- src \
  > "$RECOVERY_WORK/source-facing-overlay.patch"
git reset --quiet -- src
cmp "$RECOVERY_WORK/source-facing-overlay.patch" \
  "$CASE/recovered/source-facing-overlay.patch"
```

Require a 962,068-byte patch with SHA-256
`01487cd46ad03070321671860afdfacc445c3de21f7bef50f56d1e221c7405b1`.
It must touch exactly 56 paths (53 modified, two added, one deleted), with
2,411 insertions and 683 deletions. The applied target summary must be 1,951
files, 30,923,332 bytes, framed SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.

Do not infer source exactness from a clean patch application. The manifest
pins the target source-tree summary, changed-file hashes, syntax checks, and
focused tests. The source-lineage verifier reverses and reapplies the patch,
checks both complete trees, builds every declared source path, and executes
the tests against the authenticated adjacent bundles.

The declared test files are:

- `recovery/test/recovery-2.1.116-generated-fragments.test.mjs`;
- `recovery/test/recovery-2.1.116-source-overlay.test.mjs`; and
- `recovery/test/recovery-2.1.116-inherited-regressions.test.mjs`.

Require 15/15 tests from the applied-target state. The orientation-aware
overlay test and inherited-path test also pass when the repository is at the
base orientation; this prevents either tree orientation from being mislabeled.

Keep adjacent deltas separate from inherited localization gaps. A generated
fragment whose baseline and target occurrence counts are equal can justify a
target-facing source placement, but it must be labeled inherited rather than
claimed as newly introduced by 2.1.116. Changelog text and readable source
alone are not adjacent-code proof.

## 8. Run the complete gate in the applied target state

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.114/package.tgz" \
  --repo .
```

Require all nine statuses:

```text
evidence-verified
bun-container-verified
source-lineage-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
readable-diff-verified
embedded-code-reconstructed
exact-package-tree-reconstructed
```

The evidence gate also rechecks all 27 manifest-declared generated case files
by byte length and SHA-256; an unasserted or modified inventory, payload, or
ledger is not accepted as a complete case.

## 9. Audit reversibility and restore the 2.1.116 handoff

The repository is handed off at the applied 2.1.116-facing target. The lineage
gate already proves reversibility in a disposable workspace. To audit the same
transition manually after the applied-target gate succeeds, reverse only this
case's overlay, confirm the base summary, and immediately reapply it:

```sh
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"
git apply --reverse "$CASE/recovered/source-facing-overlay.patch"

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree("src");
  console.log(JSON.stringify(summary));
'

git apply --check "$CASE/recovered/source-facing-overlay.patch"
git apply "$CASE/recovered/source-facing-overlay.patch"
```

In the reversed orientation, require 1,950 files, 30,868,629 bytes, and framed
SHA-256
`45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0`.
After reapplying, require 1,951 files, 30,923,332 bytes, and framed SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
Do not leave the working tree at the base orientation, and do not reverse any
cumulative pre-2.1.116 overlay.
