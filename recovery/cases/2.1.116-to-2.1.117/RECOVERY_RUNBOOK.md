# 2.1.116 → 2.1.117 recovery runbook

This is the reproducible acquisition, extraction, reconstruction, accounting,
source-localization, application, and verification procedure for Claude Code
2.1.117 from the adjacent verified 2.1.116 release. Both releases use a thin
npm wrapper and a per-platform Bun executable, so canonical generated code
comes from direct slices of authenticated Linux x64 executables.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.116-to-2.1.117
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

Keep both temporary paths for the full run. Do not run the memory-intensive
readable-diff generator concurrently with attribution on a small host.

## 1. Prove publication adjacency and acquire artifacts

Resolve exact versions, not mutable npm tags:

```sh
for version in 2.1.116 2.1.117; do
  pixi run npm view "@anthropic-ai/claude-code@$version" \
    version time dist --json
  pixi run npm view "@anthropic-ai/claude-code-linux-x64@$version" \
    version time dist --json
done

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.116 refs/tags/v2.1.117

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.117
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -2 FETCH_HEAD
git -C "$UPSTREAM_GIT" diff --stat FETCH_HEAD^ FETCH_HEAD
```

Require all of the following:

- 2.1.117 is the next registry version after 2.1.116;
- target Linux x64 and wrapper publication times are respectively
  `2026-04-21T21:52:22.049Z` and `2026-04-21T21:54:08.640Z`;
- target commit `2fa67717b8046c253cfa55fd84002e3501f1eca6` directly names
  2.1.116 commit `fe53778ed90fd971bf4ec78fa1f65ccf0536352f` as its parent; and
- the target tree is `a6593f7f3672246bffb84d54dec5ee4b9c9c4e6a` and the public diff
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
  --baseline "$RECOVERY_ARTIFACTS/2.1.116/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.117/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.116 \
  --target-version 2.1.117 \
  --baseline-shasum 27abb10e16fcb2ee5236a60ec07fa3aa68dd4121 \
  --target-shasum c821c4495532412bd0d79de4581f5ce22dd75798 \
  --baseline-integrity \
    'sha512-4QGIIgpfZIznRqlMpEbn5lz8HyGaU+WZND+MGo4sCdMfGBwJPQ5OyXaiA8zhgFtlGW5iWAbYR5CpjQhrvCFeCw==' \
  --target-integrity \
    'sha512-HnFzlXyYBxpIFg9eLoWiExXgdvjQJVIGnfGtJJZjOdYUqiI2yd0STro8XxdllWupEqMdxiES62Js6ZsYDjHMwg==' \
  --baseline-signature \
    'MEQCIGTbqRDUR0z7WA3cwr2Wwh/yxO1g2S5QC4xu5vtf7QhnAiA7j8WvPyIYj36a1vRMR3qz72wQN/FnUunYPb8fcEUWWg==' \
  --target-signature \
    'MEQCIClxqm/yWW+R3vknyvjLOaaS5V/g8jTcsxDp/SLvebatAiA0LAs89LfTbsW5QCMg+KS9rzJHXu5dddT1BVDJbhWG5w==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.116.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.117.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require seven paths, six unchanged, one changed, no additions, removals, or
mode-only changes, and 132,486 target member bytes. The only changed path must
be `package/package.json`; `install.cjs` and `sdk-tools.d.ts` must be identical.

Regenerate the sole deterministic wrapper patch:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.116/package/package.json" \
  --target "$RECOVERY_ARTIFACTS/2.1.117/package/package.json" \
  --output "$RECOVERY_WORK/package.json.zstd-delta" \
  --expected-baseline-sha256 \
    7f6ee419ce8f1c2ab01b417c0ead73055942d720f015e33d2c8b452a7fbf2931 \
  --expected-target-sha256 \
    e247be0d290213d920e55404d7efe8282ba4885d4ea6d044f4422dd2d0d80e48

cmp "$RECOVERY_WORK/package.json.zstd-delta" \
  "$CASE/diff/package.json.zstd-delta"
```

Reconstruct and byte-compare every wrapper member:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.116/package.tgz" \
  --output "$RECOVERY_WORK/reconstructed-package"
```

Require seven files, 132,486 bytes, and framed-tree SHA-256
`5989877c00805b29590a870dc429703e04d625c9830e99611bf67144e5b01dbd`.

## 3. Authenticate both native inputs

```sh
sha256sum \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package/claude" \
  "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/package.tgz" \
  "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/package/claude"
```

Require, in order:

```text
0dde548c698cee7174751a92426123e90a95f56bf09271423681dd883d8bf0ea
0d1aea5ce056a5ce491da7e9bbe63f992585e5c24852f023a07c8f18cf292cc5
f01a62806aa4dd02d728463fbe3237517c8b6fe98f640e62c5dd59b48a68eaa1
b7246963d9e32ece439c3e1e7885f53773a4820e90a4d2433ef2a413a055a5fe
```

Regenerate the signed native member inventory:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/package.tgz" \
  --output "$RECOVERY_WORK/native-package-members.json" \
  --package-name @anthropic-ai/claude-code-linux-x64 \
  --baseline-version 2.1.116 \
  --target-version 2.1.117 \
  --baseline-shasum 70fc945e30491431f44e546f12e300bdc2c8c902 \
  --target-shasum 7d7e2106970e92654c5d82ad56c126de7e0f482c \
  --baseline-integrity \
    'sha512-XLlgIItxdjhr4DpSNx7eWmNtVWeCqRtaXoly58lFObpyU1Fq3HAbY//+nmqVirWKFK2BjVXLa/iq9y64+SZ4kg==' \
  --target-integrity \
    'sha512-bhN6qnc9xchKQqKWdwuZazEeSO+9NIhOPcoD/WgqTK5QRPSAwnvo5SZWIQUbkNbTKLaMwuxAu3u+Fj/jYbiidg==' \
  --baseline-signature \
    'MEUCIQDvTHFfWSO9iE5GbTsSrC3IrbuZffbJpU8P64f0E0avWgIgW3V4nNrUETut7o2s9T6EkuYUEiV776iXLHOTX2b+l+w=' \
  --target-signature \
    'MEUCIQDUymbxQflsibDfoYq28KKCAIPKbssiUho979lCvEJezQIgHBj/rmNW7BgE8R6GHIAnv92KP0had6nmBupG7SgB7zA=' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.116.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.117.tgz'

cmp "$RECOVERY_WORK/native-package-members.json" \
  "$CASE/binary-extraction/native-package-members.json"
```

Require four target members and 238,451,914 bytes; `LICENSE.md` and
`README.md` are unchanged, while `claude` and `package.json` change. The target
framed-tree hash is
`5fa90c91572702332883d3d2667772f7112faea4edee8002ef7603a3fa0c768a`.

## 4. Discover and independently verify the Bun graph

`bun_graph` is optional and external. The discovery binary used for this case
is 706,304 bytes, SHA-256
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
    "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/package/claude" \
  > "$RECOVERY_WORK/bun-graph.txt" )

cmp "$RECOVERY_WORK/bun-graph.txt" \
  "$CASE/binary-extraction/bun-graph.txt"
```

If the tool or closures are unavailable, skip discovery replay. Canonical
recovery does not trust its path-rewritten extraction: manifest slices and the
independent parser are authoritative.

The `.bun` section begins at 108,658,688. The pointer rule is:

```text
actual file offset = 108658688 + displayed pointer offset + 8
length             = displayed length
```

Directly reproduce the CLI and analyzable interior:

```sh
dd if="$RECOVERY_ARTIFACTS/2.1.117-linux-x64/package/claude" \
  of="$RECOVERY_WORK/cli.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=223375704 count=13114208 status=none

dd if="$RECOVERY_WORK/cli.js" of="$RECOVERY_WORK/cli.inner.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=87 count=13114118 status=none

sha256sum "$RECOVERY_WORK/cli.js" "$RECOVERY_WORK/cli.inner.js"
pixi run node --check "$RECOVERY_WORK/cli.inner.js"
```

Require hashes `092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744`
and `518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661`.
The manifest similarly declares the two helper JavaScript files, the
114,716,816-byte JSC cache, and both native addons.

Independently reparse and verify all five records:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five module records, exact set equality for
all three JavaScript artifacts and all five content records, and every range
and hash from `binary-extraction/inventory.json`.

## 5. Regenerate and replay exact payloads

Regenerate every changed embedded-JavaScript patch:

```sh
for spec in \
  'cli.js 06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193 092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744' \
  'image-processor.js 002990b18416af4ecf2285dd74a221172f60f37976365ef9f78e13017f6ce65e 142f1fb5b1fe8bbf36a6354fd57ea664df6017abbe141b947a8c76803ee27fd4' \
  'audio-capture.js e12b26d7eb3fa21a907b723934675d794d580100657e12a40a05d9211bb7acc3 9af487c58982c587a8867755cf7d53a01ee43d29f420ff879280e22f633a51e5'
do
  set -- $spec
  name=$1
  baseline_sha=$2
  target_sha=$3
  pixi run node recovery/scripts/build-exact-delta.mjs \
    --baseline "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/$name" \
    --target "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/$name" \
    --output "$RECOVERY_WORK/$name.zstd-delta" \
    --expected-baseline-sha256 "$baseline_sha" \
    --expected-target-sha256 "$target_sha"
  cmp "$RECOVERY_WORK/$name.zstd-delta" \
    "$CASE/diff/$name.zstd-delta"
done
```

Replay every checked payload, including the wrapper patch, rather than merely
trusting fresh generation:

```sh
REPLAY="$RECOVERY_WORK/replay"
mkdir "$REPLAY"

replay_payload() {
  name=$1
  baseline=$2
  target=$3
  pixi run zstd -d --patch-from="$baseline" \
    "$CASE/diff/$name.zstd-delta" \
    -o "$REPLAY/$name" --force
  cmp "$REPLAY/$name" "$target"
}

replay_payload cli.js \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.js" \
  "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.js"
replay_payload image-processor.js \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/image-processor.js" \
  "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/image-processor.js"
replay_payload audio-capture.js \
  "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/audio-capture.js" \
  "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/audio-capture.js"
replay_payload package.json \
  "$RECOVERY_ARTIFACTS/2.1.116/package/package.json" \
  "$RECOVERY_ARTIFACTS/2.1.117/package/package.json"
```

Reconstruct the complete embedded JavaScript graph:

```sh
pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require three files, 13,119,334 bytes, and framed-tree SHA-256
`26598d0fb6db81ebd03970649741d81b9bdae1499b325e7c502a885bb47ad447`.

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
  --target "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.inner.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json \
    "$RECOVERY_ARTIFACTS/2.1.117/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.117/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-2fa67717.md" \
  --changelog-section 2.1.117

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    1c209fa0d7af3706c964a80c7d5dd8b4aff982f165b22f38cd240fb7de04cf51 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661

for name in summary.json sources.jsonl.gz target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 13,114,118 accounted target UTF-16 units and zero unaccounted.

Regenerate the adjacent structural ledger:

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.inner.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    f778ae437cfcc8f25940c7bd0565e5a0d075fe00ea603e5f54f9db492274f152 \
  --expected-bytes 2392225 \
  --expected-baseline-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-tokens 4101395 \
  --expected-target-units 20799

cmp "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Regenerate the readable comparison with sufficient heap:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff"
pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.116-linux-x64/cli.inner.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.inner.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661

for name in metadata.json normalized.diff.gz statements.diff renames.tsv; do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    464af12624d44ad2b3c8a260719e395a88728ceef20c352f5fc416fb07401270 \
  --expected-baseline-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661
```

Require 20,799 target structural units and 4,101,395 target tokens, all
classified. The readable comparison invariant hashes must remain equal.

## 7. Replay and verify the source-facing overlay

The normal repository handoff already carries the applied 2.1.117 target; do
not apply the overlay a second time. In a clean checkout, confirm that the
reverse orientation applies and inspect the frozen target summary:

```sh
git diff --exit-code -- src
git diff --cached --exit-code -- src
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree("src");
  console.log(JSON.stringify(summary));
'
```

For a clean-room replay, start instead from commit
`e08046f528857203cbdede147bcab8b8b8021bf7`, whose `src` Git tree is
`6f4e63ccc6cf7a3ff146f1b2d46b94136f0b00cf`, while retaining this recovery
case outside that disposable checkout. Point `CASE` at the retained case, then
apply only its forward patch:

```sh
git diff --exit-code -- src
git diff --cached --exit-code -- src
test "$(git rev-parse HEAD:src)" = \
  6f4e63ccc6cf7a3ff146f1b2d46b94136f0b00cf

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

Require a 637,321-byte patch with SHA-256
`d2063694679f1a1e02d41c84bb375da029263e1feff9c1e457d66df979e21773`.
It must touch exactly 123 paths (115 modified, seven added, one deleted), with
2,864 insertions and 856 deletions. The applied target summary must be 1,957
files, 30,993,723 bytes, framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.

Do not infer source exactness from a clean patch application. The manifest
pins the target source-tree summary, changed-file hashes, syntax checks, and
focused tests. The source-lineage verifier reverses and reapplies the patch,
checks both complete trees, builds every declared source path, and executes the
tests against the authenticated adjacent bundles.

Exactness belongs to the reconstructed generated JavaScript graph and wrapper
tree. The source-facing overlay remains a necessarily partial localization
because no target source map exposes erased authored spelling or module
boundaries.

The declared test files are:

- `recovery/test/recovery-2.1.117-generated-fragments.test.mjs`;
- `recovery/test/recovery-2.1.117-recovery-boundaries.test.mjs`; and
- `recovery/test/recovery-2.1.117-source-overlay.test.mjs`.

Require all 122 target-existing changed TypeScript/TSX paths to pass Bun
syntax construction and 8/8 tests from both the base and applied-target
orientations.

Keep adjacent deltas separate from inherited localization gaps. A generated
fragment whose baseline and target occurrence counts are equal can justify a
target-facing source placement, but it must be labeled inherited rather than
claimed as newly introduced by 2.1.117. Changelog text and readable source
alone are not adjacent-code proof.

The manifest freezes 44 classified generated fragments and 14 source/boundary
ledger entries. Do not create speculative authored modules for the
generated-only background-job agent or context-hint controller, the external
VSCode ManagePlugins component, or the unsupported stale-resume summary. Keep
the fork module labeled inherited, and retain explicit source-mirror gaps for
the generated `powerup`, `team-onboarding`, `toggle-memory`, `recap`, `mode`,
and `stop-hook` command modules.

## 8. Run the complete gate in the applied target state

With the normal checkout or disposable replay at the applied target, run:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.116/package.tgz" \
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

The evidence gate also rechecks all 25 manifest-declared generated case files
by byte length and SHA-256; an unasserted or modified inventory, payload, or
ledger is not accepted as a complete case.

## 9. Audit reversibility and restore the applied 2.1.117 handoff

The repository is handed off at the applied 2.1.117-facing target. The lineage
gate already proves reversibility in a disposable workspace. To audit the same
transition manually after the applied-target gate succeeds, begin with a clean
target checkout, reverse only this case's overlay, confirm the base summary,
and immediately reapply it:

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

pixi run node --input-type=module -e '
  import { summarizeSourceTree } from "./recovery/scripts/verify-source-lineage.mjs";
  const { records, ...summary } = summarizeSourceTree("src");
  console.log(JSON.stringify(summary));
'

git diff --exit-code -- src
git diff --cached --exit-code -- src
```

In the reversed orientation, require 1,951 files, 30,923,332 bytes, and framed
SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
After reapplying, require 1,957 files, 30,993,723 bytes, and framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
Do not leave the working tree at the base orientation, and do not reverse any
cumulative pre-2.1.117 overlay. The archived patch remains the exact forward
record of the transition.
