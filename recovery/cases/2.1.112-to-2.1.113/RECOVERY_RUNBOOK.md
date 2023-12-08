# 2.1.112 → 2.1.113 recovery runbook

This is the reproducible construction, extraction, localization, and replay
procedure for Claude Code 2.1.113 from the adjacent verified 2.1.112 release.
It explicitly handles the 2.1.113 transition from a universal npm package
containing `cli.js` to a thin wrapper that installs a per-platform Bun native
executable.

## 0. Prepare the environment

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts

CASE=recovery/cases/2.1.112-to-2.1.113
RECOVERY_ARTIFACTS=$(mktemp -d)
RECOVERY_WORK=$(mktemp -d)
```

The readable-diff generator is memory-intensive. On an 8 GiB host, give it a
6 GiB old-space limit and do not run it concurrently with attribution.

## 1. Prove release order and pin immutable inputs

Resolve exact versions, never a mutable npm tag:

```sh
pixi run npm view @anthropic-ai/claude-code@2.1.112 version time dist --json
pixi run npm view @anthropic-ai/claude-code@2.1.113 version time dist --json
pixi run npm view \
  @anthropic-ai/claude-code-linux-x64@2.1.113 version time dist --json

git ls-remote --tags https://github.com/anthropics/claude-code.git \
  refs/tags/v2.1.112 refs/tags/v2.1.113

UPSTREAM_GIT="$RECOVERY_WORK/upstream-git"
git init -q "$UPSTREAM_GIT"
git -C "$UPSTREAM_GIT" fetch --quiet --depth=2 \
  https://github.com/anthropics/claude-code.git refs/tags/v2.1.113
git -C "$UPSTREAM_GIT" log --format='%H %P %T %s' -2 FETCH_HEAD
```

Require wrapper publication times `2026-04-16T19:23:46.419Z` for 2.1.112
and `2026-04-17T19:09:22.930Z` for 2.1.113. Require the Linux x64 package at
`2026-04-17T19:07:25.246Z`. The lightweight tags must resolve to
`2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff` and
`71366ecf5dd9103a46537eab8607a2a3c0637577`.

The target tag directly names the baseline as its parent and has tree
`dc3c978fa5469f61234496eb70e0ed820cbb2581`. Its public commit changes only
`CHANGELOG.md`; it does not publish the authored implementation.

Acquire and hash-check every manifest artifact:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"
```

This authenticates both adjacent wrapper packages, the 2.1.113 Linux x64
package and executable, every declared executable byte slice, the matching
2.1.88 source-oracle bundle/map, and the changelog at the target tag. Pin the
exact 4,017-byte 2.1.113 changelog section, SHA-256
`0bbc8ace442ec0ae7682d40580e82fc9192d59e227c6b21bfa9eee6fbc818545`.

## 2. Authenticate and compare the wrapper package topology

Run the exhaustive tar-member comparator with the SHA-1, SRI, signatures,
registry key, URLs, package name, and versions pinned in `manifest.json`.
Write its result into the temporary directory, then compare it with the
checked-in report:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.112/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.113/package.tgz" \
  --output "$RECOVERY_WORK/package-members.json" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.112 \
  --target-version 2.1.113 \
  --baseline-shasum 318f43288d7056ae1eae9a23f4b7531ef3c67d31 \
  --target-shasum 328c2679ae7b862e436c62c66807adb2f89be937 \
  --baseline-integrity \
    'sha512-9FUgJ0EOvILyhIqxFKNVliebiUjL68dwpEW3eGSSe0vkVDJ1c5qMDNWc22gW3zkD7zRAqtfQPSGv0t4vMM2DPA==' \
  --target-integrity \
    'sha512-RHeZ8rxKNcgtxJ+pVl5qGlyOXFejLVMiL/OXCwRy4yjbpUfZfcgqzcqke8++Qw4ewelykcMZYtTolbU+ounvog==' \
  --baseline-signature \
    'MEUCIQDNq+V7L+Ux4Tqk1/LPdRRGFISaAt8swegEx6TzM4T+cAIgaIK07ApqnGOyp4GGh7oejfKBxqufKt5pL6R7l8cU1RU=' \
  --target-signature \
    'MEYCIQD1PCoUxnVOa3vNXJFO+DCMnZxg9gBfNSHLZCog98XgZgIhALyDNU+bXnP/nMdO9LDnVfhwEy5zcBYtpJK5cYrRmIQO' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.112.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.113.tgz'

cmp "$RECOVERY_WORK/package-members.json" "$CASE/package-members.json"
```

Require 20 baseline members, seven target members, three unchanged, one
changed, three added, and sixteen removed. The target must contain 132,292
member bytes with framed-tree SHA-256
`7333b8898ec3e7ef6a624848581b4ca22dbca42e2036b3c2519f688a74d21721`.

Also authenticate the four-member Linux x64 package. It must contain
236,412,106 member bytes, including an executable `package/claude` of
236,411,520 bytes, SHA-256
`a81f7726b3b6b910e50c08a09f0090cb60714695d6d01bfe8698ff16cda9b87d`.
Do not treat the native executable as a baseline-derived source artifact.

The native-package inventory is a self-comparison: both sides name the same
signed artifact so the general comparator authenticates it and inventories
every member without implying an adjacent native baseline:

```sh
pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package.tgz" \
  --target "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package.tgz" \
  --output "$RECOVERY_WORK/native-package-members.json" \
  --package-name @anthropic-ai/claude-code-linux-x64 \
  --baseline-version 2.1.113 \
  --target-version 2.1.113 \
  --baseline-shasum 62a7c9d9d5c2a42116c1e689e0fd88cd63f5edad \
  --target-shasum 62a7c9d9d5c2a42116c1e689e0fd88cd63f5edad \
  --baseline-integrity \
    'sha512-C2evSiNGVGKlCOxNYk4t/DMFGWApnzwiTKfcMD7MzIU5G8JxSIRz7NylAPq0Dyt16wlNj2Vug2aY0VyrGaDueg==' \
  --target-integrity \
    'sha512-C2evSiNGVGKlCOxNYk4t/DMFGWApnzwiTKfcMD7MzIU5G8JxSIRz7NylAPq0Dyt16wlNj2Vug2aY0VyrGaDueg==' \
  --baseline-signature \
    'MEYCIQCAiXKjHceWhkq7UZHEoYM+5e/T/WjK/dHaJJIkogcxbwIhAM8gMLSl2FMnK2afxJsPOiDX0HsH2F0Yul6oVJlUjY+8' \
  --target-signature \
    'MEYCIQCAiXKjHceWhkq7UZHEoYM+5e/T/WjK/dHaJJIkogcxbwIhAM8gMLSl2FMnK2afxJsPOiDX0HsH2F0Yul6oVJlUjY+8' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.113.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.113.tgz'

cmp "$RECOVERY_WORK/native-package-members.json" \
  "$CASE/binary-extraction/native-package-members.json"
```

## 3. Discover the Bun graph

`bun_graph` is optional and external to this repository. The session used an
operator-supplied binary; there is no canonical distribution URL recorded for
it. Pin that exact file before attempting discovery:

```sh
wc -c "$(command -v bun_graph)"
sha256sum "$(command -v bun_graph)"
# 706304 bytes
# aa176c3df916a18bee1fe445fb37629bf4435a9dd72f4def8f833742685b3767
```

The binary is dynamically linked to Nix libraries, and plain invocation fails
when those closures are unavailable. The historical run used the following
environment-specific cached closures. These paths document the session; they
are not portable installation instructions:

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
    "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package/claude" \
  > "$RECOVERY_WORK/bun-graph.txt" )

cmp "$RECOVERY_WORK/bun-graph.txt" "$CASE/binary-extraction/bun-graph.txt"
```

Use `bun_graph` to discover the `.bun` section, directory, and entry-point
layout. Do not adopt its `--extract` JavaScript as canonical: extraction
rewrites `/$bunfs/root/` to the chosen output path.

If the exact external binary or its ABI-compatible closures are unavailable,
skip this discovery replay. The checked-in output is hash-pinned, and exact
recovery uses manifest-declared raw slices plus the independent container
parser in the next step; neither requires launching `bun_graph`.

## 4. Extract canonical raw ranges

Interpret each displayed Bun `StringPointer` with an eight-byte bias:

```text
actual file offset = .bun file offset + displayed pointer offset + 8
length             = displayed pointer length
```

For the CLI entry point:

```sh
dd if="$RECOVERY_ARTIFACTS/2.1.113-linux-x64/package/claude" \
  of="$RECOVERY_WORK/cli.js" \
  bs=1048576 iflag=skip_bytes,count_bytes \
  skip=$((0x06714000 + 0x06c1fec0 + 8)) \
  count=12986842 status=none

sha256sum "$RECOVERY_WORK/cli.js"
# dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681
```

Extract the two helper JavaScript entries, two native addons, and CLI JSC
cache from the offsets in `binary-extraction/inventory.json`. Strip exactly
the 87-byte CommonJS prefix and three-byte suffix from the raw CLI to produce
`cli.inner.js`; require 12,986,752 bytes and SHA-256
`4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba`.

Independently reparse the container rather than trusting discovery output:

```sh
pixi run node recovery/scripts/verify-bun-container.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Require `bun-container-verified`, five module records, the raw ranges and
hashes frozen in the inventory, and passing `node --check` for the analyzable
CLI.

## 5. Build exact embedded-code payloads

Build a Zstandard dictionary delta from the adjacent 2.1.112 `cli.js` to the
raw Bun-wrapped 2.1.113 entry:

```sh
pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.js" \
  --output "$RECOVERY_WORK/cli.js.zstd-delta" \
  --expected-baseline-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-sha256 \
    dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681

cmp "$RECOVERY_WORK/cli.js.zstd-delta" "$CASE/diff/cli.js.zstd-delta"
```

Require 3,006,851 payload bytes and SHA-256
`11c55b5f406469a55f42a63562a2cb6ed53283147c9c6dd191fe37927665f98a`.
Compress the two helper JavaScript slices with the pinned Zstandard 1.5.7
implementation and deterministic single-threaded level-19 settings:

```sh
pixi run zstd -19 --single-thread --no-progress --force \
  "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/image-processor.js" \
  -o "$RECOVERY_WORK/image-processor.js.zst"

pixi run zstd -19 --single-thread --no-progress --force \
  "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/audio-capture.js" \
  -o "$RECOVERY_WORK/audio-capture.js.zst"

cmp "$RECOVERY_WORK/image-processor.js.zst" \
  "$CASE/diff/image-processor.js.zst"
cmp "$RECOVERY_WORK/audio-capture.js.zst" \
  "$CASE/diff/audio-capture.js.zst"
```

Require 1,322 and 1,318 payload bytes, with SHA-256 values
`9daa5bf282c4d89ddff3170fe5cc3c83bb2479255bb761bc58117f5e4d79881b`
and
`6468ea6b1aee8a99f9e0e01f94d84c479a3fbfe70b31365a4f7cdd7d3de8d572`.

Replay and byte-compare all three entries:

```sh
pixi run node recovery/scripts/reconstruct-embedded-code.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --output "$RECOVERY_WORK/embedded-code"
```

Require `embedded-code-reconstructed`, three files, 12,991,968 bytes, and
framed-tree SHA-256
`9272fcbb565dac0fd95b1d0ac3924dc8708b0173cbf4564b228d7a1225209a6a`.

## 6. Freeze and replay the thin wrapper

Build the manifest delta and the three standalone member payloads. The
checked-in 139-byte manifest patch uses the same pinned Zstandard 1.5.7,
single-threaded level-19 settings as the standalone payloads:

```sh
pixi run zstd -19 --single-thread --no-progress --force \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.112/package/package.json" \
  "$RECOVERY_ARTIFACTS/2.1.113/package/package.json" \
  -o "$RECOVERY_WORK/package.json.zstd-delta"

pixi run zstd -d --force \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.112/package/package.json" \
  "$RECOVERY_WORK/package.json.zstd-delta" \
  -o "$RECOVERY_WORK/package.json.reconstructed"
cmp "$RECOVERY_WORK/package.json.reconstructed" \
  "$RECOVERY_ARTIFACTS/2.1.113/package/package.json"

for member in bin/claude.exe cli-wrapper.cjs install.cjs
do
  output_name=$(printf '%s' "$member" | tr / -)
  pixi run zstd -19 --single-thread --no-progress --force \
    "$RECOVERY_ARTIFACTS/2.1.113/package/$member" \
    -o "$RECOVERY_WORK/$output_name.zst"
done

cmp "$RECOVERY_WORK/package.json.zstd-delta" \
  "$CASE/diff/package.json.zstd-delta"
cmp "$RECOVERY_WORK/bin-claude.exe.zst" "$CASE/diff/bin-claude.exe.zst"
cmp "$RECOVERY_WORK/cli-wrapper.cjs.zst" "$CASE/diff/cli-wrapper.cjs.zst"
cmp "$RECOVERY_WORK/install.cjs.zst" "$CASE/diff/install.cjs.zst"
```

Require payload lengths 139, 278, 1,656, and 2,427 bytes and the hashes in
`manifest.json`. Recover `package/package.json` with its dictionary patch,
decompress the three new wrapper members, reuse the three unchanged members,
and delete the sixteen obsolete members. Replay against the 2.1.112 tarball:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.112/package.tgz" \
  --output "$RECOVERY_WORK/wrapper-package"
```

Require exact equality with all seven authenticated target members and
framed-tree SHA-256
`7333b8898ec3e7ef6a624848581b4ca22dbca42e2036b3c2519f688a74d21721`.
The exact wrapper replay and exact embedded-JavaScript replay are distinct
checks: the thin wrapper does not itself contain the executable source.

## 7. Build exhaustive source attribution

Use 2.1.112 only for adjacent generated comparison. Use the matching 2.1.88
bundle/map pair only for historical source ownership:

```sh
ATTRIBUTION_REGEN="$RECOVERY_WORK/attribution"
mkdir "$ATTRIBUTION_REGEN"

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --map "$RECOVERY_ARTIFACTS/2.1.88/cli.js.map" \
  --target "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.inner.js" \
  --output "$ATTRIBUTION_REGEN" \
  --target-package-json "$RECOVERY_ARTIFACTS/2.1.113/package/package.json" \
  --target-dts "$RECOVERY_ARTIFACTS/2.1.113/package/sdk-tools.d.ts" \
  --changelog \
    "$RECOVERY_ARTIFACTS/evidence/claude-code-CHANGELOG-71366ecf.md" \
  --changelog-section 2.1.113

pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$ATTRIBUTION_REGEN" \
  --expected-summary-sha256 \
    29197dacd2957604c9c73a96f3308d92067b0f6b3058d6d2ea38738c19334157 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_REGEN/$name" "$CASE/attribution/$name"
done
```

Require 4,756 source rows, 4,986 target initializers, 30,163 partitions, and
12,986,752 / 12,986,752 accounted UTF-16 code units. Three conservatively
unresolved partitions may remain, but unaccounted target code must be zero.

## 8. Build the structural ledger

Normalize only the fixed Bun wrapper, then compare adjacent generated code:

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.inner.js" \
  --output "$RECOVERY_WORK/generated-delta.json.gz"

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$RECOVERY_WORK/generated-delta.json.gz" \
  --expected-sha256 \
    383448923995bb86060ce91beac2bc5adac35817a0cdff35b533135c7d24345f \
  --expected-bytes 3292982 \
  --expected-baseline-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-tokens 4051255 \
  --expected-target-units 20447

cmp "$RECOVERY_WORK/generated-delta.json.gz" \
  "$CASE/structural/generated-delta.json.gz"
```

Every target token must be classified exactly once: 2,005,441 matched,
22,684 moved, 142,629 coarse-changed, and 1,880,501 unresolved. Unresolved
means no defensible adjacent pairing, not missing recovered code.

## 9. Independently regenerate the readable comparison

Generate into a fresh directory from authenticated inputs. Never use the
checked-in readable artifacts as generator input:

```sh
READABLE_REGEN="$RECOVERY_WORK/readable-diff-regenerated"

pixi run node --max-old-space-size=6144 \
  recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.112/package/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.113-linux-x64/cli.inner.js" \
  --output "$READABLE_REGEN" \
  --expected-baseline-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba

for name in metadata.json normalized.diff.gz statements.diff renames.tsv
do
  cmp "$READABLE_REGEN/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_REGEN" \
  --expected-metadata-sha256 \
    26ebb56c29812cdeb3130691da81ccc092acfeaa33c420191c51b013ae61af6d \
  --expected-baseline-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba
```

Require invariant
`d7aa031c11bb709fd05e2f7b4028c4b0cde742b687521d2b0ae40f29b458b4f0`
and 19,526 baseline / 20,447 target statements.

## 10. Localize semantic changes without overclaiming source

Inspect the compact statement diff, every normalized hunk, the exact target
fragments, and all 38 changelog bullets:

```sh
less "$CASE/readable-diff/statements.diff"
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
sed -n '/^## 2\.1\.113$/,/^## /p' \
  "$CASE/evidence/claude-code-CHANGELOG-71366ecf.md"
```

Keep four evidence levels distinct:

1. exact signed wrapper and authenticated Linux x64 executable;
2. exact raw embedded JavaScript and exhaustive generated accounting;
3. normalized comparison plus public release intent; and
4. equivalent source-facing placement where a cumulative source owner exists.

Map only behaviors supported by target fragments and existing source owners.
For this case those include denied domains, comment-label hardening, private
macOS path normalization, input keys, OSC 8 links, Remote Control operations,
ToolSearch ranking, effort filtering, per-call MCP and async-agent watchdogs,
and image failure degradation. Leave the rest exact at the generated layer.

## 11. Freeze and verify the source-facing overlay

During case construction, create the incremental patch while the candidate
2.1.113 overlay is applied to the verified 2.1.112 source base:

```sh
PATCH_REGEN="$RECOVERY_WORK/source-facing-overlay.patch"
git diff --binary HEAD -- src > "$PATCH_REGEN"

while IFS= read -r source_path
do
  git diff --binary --no-index -- /dev/null "$source_path" \
    >> "$PATCH_REGEN" || test "$?" -eq 1
done < <(git ls-files --others --exclude-standard src | sort)

cmp "$PATCH_REGEN" "$CASE/recovered/source-facing-overlay.patch"
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"
git apply --numstat "$CASE/recovered/source-facing-overlay.patch"
```

Require 34,166 patch bytes, SHA-256
`a630c35001addf768a4fa679c006bcfd12c402681c686228c8b4e117c31506f8`,
21 affected existing paths, 338 insertions, and 66 deletions.

The base must contain 1,950 files and 30,859,372 bytes with framed SHA-256
`a4a78ad2e102ea43ab739cf19ab1018ed52a1c809171f73b77e7c9e973ad9195`.
The applied target must contain 1,950 files and 30,868,405 bytes with framed
SHA-256
`f5a8fb6af53d86a047c56e5873253e330963b2c0d8b0c4517986380124c064d3`.

The reverse check is required here because the repository contains the applied
target state. A forward check correctly fails while the target remains applied.
Keep the target applied through verification and the final handoff.

## 12. Run source-lineage and complete-recovery gates

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.112/package.tgz"
```

The final command must report:

```text
status: complete-recovery-verified
scope.completeness: generated-code-complete-linux-x64-source-partial
wrapper members: 7
wrapper bytes: 132292
wrapper framed tree: 7333b8898ec3e7ef6a624848581b4ca22dbca42e2036b3c2519f688a74d21721
raw embedded CLI: 12986842 bytes, dda4d89e...036681
embedded JavaScript: 3 files, 12991968 bytes
embedded JavaScript framed tree: 9272fcbb...9a6a
target UTF-16: 12986752, unaccounted: 0
target tokens: 4051255, classified: 4051255
```

After all gates pass, keep the source-only overlay applied and prove that it is
reversible without changing the handoff tree:

```sh
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"
```

The committed repository source tree is the 2.1.113-facing target. Later
verification passes the repository root directly as `--repo`; the lineage gate
performs its own checked reverse/reapply cycle against the recorded 2.1.112
base.

## Reusable native-packaging method

For later adjacent releases using this topology:

1. Authenticate the thin wrapper and the selected signed platform package
   separately.
2. Treat the native executable as an immutable target input unless a verified
   reproducible native-build chain exists.
3. Use `bun_graph` only for discovery and cross-checking.
4. Parse the Bun footer and directory independently; resolve pointers with
   the recorded bias and extract canonical raw slices.
5. Recover every plain JavaScript graph entry exactly and verify it against
   the executable, while keeping JSC and native ranges classified as binary.
6. Compare only the fixed-wrapper interior with the adjacent generated bundle.
7. Reconstruct and verify the thin wrapper as a separate package-tree layer.
8. Build attribution, structural, readable, fragment, source-lineage, and
   focused-test ledgers exactly as for earlier adjacent cases.
9. Keep the exact generated claim separate from any partial source-facing
   overlay, and apply that overlay to the source mirror only after the complete
   gate verifies its recorded base and target lineage.
