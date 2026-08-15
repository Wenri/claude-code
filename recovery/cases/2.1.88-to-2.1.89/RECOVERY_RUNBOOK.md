# Complete 2.1.88 → 2.1.89 recovery runbook

This is the chronological, reproducible path used in this repository to
recover Claude Code 2.1.89 from the 2.1.88 source-map baseline.

It documents the steps that affect the evidence or final deliverables.
Exploratory visualizations, temporary statement dumps, and abandoned
normalization experiments are listed separately at the end because they are
not recovery dependencies.

The procedure has two phases:

- **case construction (steps 1–11):** freeze the available release evidence
  and derive the exact delta, exhaustive ledgers, readable comparison, and
  bounded source patches;
- **recovery and publication (steps 12–15):** apply the committed source
  overlay, reconstruct the exact package, run the aggregate gate, and publish
  the verified repository state.

The committed case already contains phase A's deterministic outputs. A later
recovery can acquire the pinned artifacts and start with phase B, while the
regeneration commands remain available for independent auditing.

## Scope before starting

“Complete” has two deliberately separate meanings:

1. The **published 2.1.89 code and package are exact**. The recovered
   `cli.js` and all 19 npm member files compare byte-for-byte with the
   published target.
2. The **authored TypeScript is partial**. 2.1.89 published no source map, so
   erased names, types, comments, formatting, and exact module boundaries
   cannot be recovered uniquely.

The current repository `src/` is therefore:

> the exact 2.1.88 outer/Bun-input source-map layer, plus the verified
> source-facing 2.1.89 Bash/parser overlay described in step 12.

The exact complete 2.1.89 program is the reconstructed generated bundle and
package tree, not a claim that all 1,902 authored source modules were restored
to their original spelling.

## Prerequisites

From the repository root:

```sh
pixi install
pixi run npm --prefix recovery ci --ignore-scripts
```

Install Pixi if it is not already available. The recovery environment pins:

- Node.js and Bun through `pixi.lock`;
- Acorn 8.15.0;
- eslint-scope 9.1.2; and
- Zstandard 1.5.7.

Set reusable paths:

```sh
CASE=recovery/cases/2.1.88-to-2.1.89
ARTIFACTS=$(mktemp -d)
BASELINE_TARBALL=/path/to/claude-code-2.1.88.tgz
```

The baseline tarball is user-supplied because npm withdrew 2.1.88. It is
accepted only if it is 31,196,633 bytes with SHA-256:

```text
d836a86d9150ecc594a7025524c50e24080478904c979f386d447770275ef813
```

The exact bundle/map recovery does not depend on that tarball. It is required
only for authenticated whole-package member comparison/reconstruction.
Do not create it from the source mirror: that checkout has an added notice,
and its archive/compression metadata do not reproduce the npm package.

## 1. Establish that the source baseline is 2.1.88

The 2.1.88 generated bundle is pinned at:

```text
bytes   13,047,043
sha256  75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f
```

Its header identifies version 2.1.88. Its 59,766,257-byte source map is
pinned at:

```text
7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

Before the overlay was applied, all 1,902 repository application files
equaled the map's `sourcesContent` byte-for-byte, with no missing or extra
files. The current overlay-aware verifier preserves that proof for every
unmodified file and separately checks the four applied recovery files.

## 2. Pin and acquire all available evidence

The case manifest records URLs, archive members, byte counts, and SHA-256
digests. Acquire them into a new directory:

```sh
pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$ARTIFACTS"
```

This fetches and verifies:

- 2.1.88 `cli.js`, `cli.js.map`, `sdk-tools.d.ts`, and `package.json`;
- the published 2.1.89 npm tarball and its three changed readable members;
  and
- the commit-pinned official changelog.

Never substitute an unpinned `latest` artifact.

The four 2.1.88 mirror files are acquired from immutable mirror commit
`c8cd253554319f32ff64ff7000636199f720c9bc`; their byte counts and hashes
remain authoritative even if a host later disappears.

Now verify the acquired evidence, source-map baseline, repository state,
target fragments, and every committed case-file assertion:

```sh
pixi run node recovery/scripts/verify-case.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$ARTIFACTS"
```

The verifier accepts exactly two coherent repository states and rejects a
partially applied patch set:

```text
exact-baseline
verified-recovered-overlay
```

A clean construction checkout reports `exact-baseline` here and transitions
to `verified-recovered-overlay` in step 12. A replay from current `main`
already reports the latter.

## 3. Authenticate the withdrawn 2.1.88 npm archive

The recovered tarball is not trusted because of its archival host. Its bytes
are authenticated against immutable npm metadata:

- SHA-1 `c22a001bea2241defb15d0124939836170389daf`;
- SRI
  `sha512-ukMtYZCi0I7cD3rt89rnXy20D/Zvk0Gj/SW60xYfz17zTslLz+VuhXw/KPb+2ndp3/ATadJdyNEqdKQlcNk7nQ==`;
- npm key ID
  `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`; and
- the registry ECDSA P-256/SHA-256 signature over
  `@anthropic-ai/claude-code@2.1.88:<SRI>`.

The immutable metadata URL and best-effort archive URL are recorded in
`manifest.json`. `package-members.json` records the successful signature,
SHA-1, SHA-512, and SHA-256 verification.

The registry tarball URL now returns 404, and the archival host can present a
human-check landing page. Neither response is evidence. Only a local file
matching all pinned npm digests and the registry signature is accepted.

Reject a wrong local archive before parsing it:

```sh
test "$(wc -c < "$BASELINE_TARBALL")" -eq 31196633
BASELINE_SHA256=$(sha256sum "$BASELINE_TARBALL" | cut -d ' ' -f1)
test "$BASELINE_SHA256" = \
  d836a86d9150ecc594a7025524c50e24080478904c979f386d447770275ef813
```

## 4. Extract and hash both baseline source layers

Extract the verified source map safely:

```sh
BASELINE_EXTRACT=$(mktemp -d)

pixi run node recovery/scripts/extract-baseline.mjs \
  --map "$ARTIFACTS/2.1.88/cli.js.map" \
  --output "$BASELINE_EXTRACT" \
  --expected-sha256 \
    7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657
```

The extractor writes:

- `bun-input/`: all 4,756 exact outer build inputs;
- `pristine/src/`: 1,902 human-facing application sources, substituting the
  nested originals for 552 TSX React-compiler outputs; and
- a deterministic extraction manifest.

Verified tree results:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| `bun-input/` | 4,756 | 47,310,128 | `f37b95c0a1eedcb74882e54c3f24c6a4efd377e1d1fa57ae9b1b07fb79f30383` |
| `pristine/src/` | 1,902 | 17,614,953 | `c9e716a5a35339840b465a2be2d4be37f9b677bfe3c3c767ecc1fec7e2167bcc` |

The distinction matters later: this repository uses the outer/Bun-input TSX
layer, while `BashTool.pristine.patch` targets the alternate nested original.

## 5. Diff every npm package member

Run the tarball comparator with the authenticated metadata values:

```sh
PACKAGE_REPORT=$(mktemp)
rm "$PACKAGE_REPORT"

pixi run node recovery/scripts/compare-npm-tarballs.mjs \
  --baseline "$BASELINE_TARBALL" \
  --target "$ARTIFACTS/2.1.89/package.tgz" \
  --output "$PACKAGE_REPORT" \
  --package-name @anthropic-ai/claude-code \
  --baseline-version 2.1.88 \
  --target-version 2.1.89 \
  --baseline-shasum c22a001bea2241defb15d0124939836170389daf \
  --target-shasum f2cb6b8b589a0d4f8a2b83a3920812a747336cf8 \
  --baseline-integrity \
    'sha512-ukMtYZCi0I7cD3rt89rnXy20D/Zvk0Gj/SW60xYfz17zTslLz+VuhXw/KPb+2ndp3/ATadJdyNEqdKQlcNk7nQ==' \
  --target-integrity \
    'sha512-etjihHqVxj1RjS5Zu/o+rv3ojn1N7AWzfgIOCSSSncfyb4qJn9J677scj0LHIxtwzjgU7j1qAedXlXKxgkFG2w==' \
  --baseline-signature \
    'MEUCIHXjhm3IsYM1o1worSMkPW8rIHqSNsV6D08wJoIArNumAiEAtiif6ZPqt/ovlEXSM0sEc8NuCteOb+yIkDZcff2kFSk=' \
  --target-signature \
    'MEQCIGE+C8+9YI/pUb190BmNwyXJoCVGOag9G1Y3vLZw2US4AiBS5g+q78qYJmLaQTdAG1Jrz2RfjHAuifZHgchG6+ESCg==' \
  --registry-key-id \
    'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U' \
  --registry-public-key \
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==' \
  --baseline-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.88.tgz' \
  --target-registry-url \
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.89.tgz'

cmp "$PACKAGE_REPORT" "$CASE/package-members.json"
```

Exact result:

- 16 unchanged members;
- three changed members: `cli.js`, `package.json`, `sdk-tools.d.ts`;
- one removed member: `cli.js.map`; and
- zero added members.

This step prevents bundle-only analysis from overlooking package metadata,
declarations, vendors, or removals.

## 6. Measure bundles and locate stable anchors

Tokenize both generated bundles and locate unique exact literal anchors:

```sh
pixi run node recovery/scripts/locate-literal-anchors.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output /tmp/2.1.88-to-2.1.89-anchors.json
```

Verified measurements:

| Measurement | 2.1.88 | 2.1.89 | Delta |
| --- | ---: | ---: | ---: |
| Bundle bytes | 13,047,043 | 13,081,065 | +34,022 |
| Acorn tokens | 4,189,150 | 4,197,802 | +8,652 |
| UTF-16 units | 12,983,328 | 13,017,066 | +33,738 |

There are 44,221 exact unique common literals; 43,590 form a monotone
subsequence. These are location sentinels, not semantic-equality claims.

## 7. Build the exhaustive source-attribution inventory

```sh
ATTRIBUTION_OUT=$(mktemp -d)

pixi run node recovery/attribution/inventory-generated-change.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --map "$ARTIFACTS/2.1.88/cli.js.map" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output "$ATTRIBUTION_OUT" \
  --target-package-json \
    "$ARTIFACTS/2.1.89/package/package.json" \
  --target-dts \
    "$ARTIFACTS/2.1.89/package/sdk-tools.d.ts" \
  --changelog \
    "$ARTIFACTS/evidence/claude-code-CHANGELOG-7ef6eec.md"

for name in \
  summary.json \
  sources.jsonl.gz \
  target-initializers.jsonl.gz \
  target-partitions.jsonl.gz
do
  cmp "$ATTRIBUTION_OUT/$name" "$CASE/attribution/$name"
done
```

The inventory proves:

- all 2,068,722 baseline mapping segments decode;
- all 4,756 baseline sources have one contiguous generated run;
- 43,591 target partitions and 43,590 exact anchor spans cover all
  13,017,066 target UTF-16 units; and
- zero target UTF-16 units are unaccounted.

Verify the checked-in report independently:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report "$CASE/attribution" \
  --expected-summary-sha256 \
    b378e9e54669a4e9188d3f5e32ee81d9e6140b98f49c615843d05eb474c13897 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

## 8. Build the exhaustive structural token ledger

```sh
pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output /tmp/generated-delta.json.gz

cmp \
  /tmp/generated-delta.json.gz \
  "$CASE/structural/generated-delta.json.gz"
```

Classification result:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 14,898 | 3,619,974 |
| Moved candidate | 1,347 | 46,432 |
| Coarse changed candidate | 480 | 124,936 |
| Unresolved pairing | 1,456 | 406,460 |
| Total | 18,181 | 4,197,802 |

Every token appears exactly once. `unresolved` means “no defensible baseline
pair,” not missing target code.

Verify the canonical gzip and internal accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger "$CASE/structural/generated-delta.json.gz" \
  --expected-sha256 \
    4196e4df68330e3f0f84614bb37c4ef98dac056c09cb139e796d41bb34afbbf8 \
  --expected-bytes 2096840 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-tokens 4197802 \
  --expected-target-units 18181
```

## 9. Construct the exact reversible bundle delta

```sh
DELTA_OUT_DIR=$(mktemp -d)
DELTA_OUT="$DELTA_OUT_DIR/cli.js.zstd-delta"

pixi run node recovery/scripts/build-exact-delta.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output "$DELTA_OUT" \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01

cmp "$DELTA_OUT" "$CASE/diff/cli.js.zstd-delta"
```

The 2,249,231-byte delta has SHA-256:

```text
33be2f1480544cbe09873fe610d5a01c66bf9bb025594637c93f3c915158db6d
```

The builder reconstructs a temporary target and compares every byte before
reporting `exact-delta-verified`.

A later consumer recovers the exact 2.1.89 executable from only the acquired
2.1.88 bundle and committed delta:

```sh
RECOVERED_BUNDLE_DIR=$(mktemp -d)
RECOVERED_BUNDLE="$RECOVERED_BUNDLE_DIR/cli.js"

pixi run zstd -d \
  --patch-from="$ARTIFACTS/2.1.88/cli.js" \
  "$CASE/diff/cli.js.zstd-delta" \
  -o "$RECOVERED_BUNDLE"

test "$(wc -c < "$RECOVERED_BUNDLE")" -eq 13081065
RECOVERED_SHA256=$(sha256sum "$RECOVERED_BUNDLE" | cut -d ' ' -f1)
test "$RECOVERED_SHA256" = \
  a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

## 10. Generate the full readable comparison

```sh
READABLE_OUT=$(mktemp -d)

pixi run node recovery/scripts/generate-readable-bundle-diff.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output "$READABLE_OUT" \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01

for name in \
  metadata.json \
  normalized.diff.gz \
  statements.diff \
  renames.tsv
do
  cmp "$READABLE_OUT/$name" "$CASE/readable-diff/$name"
done

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report "$READABLE_OUT" \
  --expected-metadata-sha256 \
    c8ffebb49805ef4f0ca597c63729ae7ce09ce5a9de6efae9e5c4d5ec0fcdf261 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

The CLI re-executes with an 8 GiB Node heap for these bundles. It:

- puts top-level statements on separate lines;
- derives one-to-one Program-scope rename candidates from structural pairs;
- accepts 16,254 safe bindings and 87,233 identifier edits;
- rejects 5,580 ambiguous or capture-prone mappings; and
- requires the same comparison-invariant hash before rewriting, after
  rewriting, and after statement normalization.

Inspect the complete diff:

```sh
gzip -cd "$CASE/readable-diff/normalized.diff.gz" | less
```

This is a comparison representation. It is not an executable replacement and
must not be applied to `src/`.

## 11. Recover the bounded readable source slice

Use the exhaustive attribution ledger to find target partitions whose
baseline candidates are Bash/parser sources. The session also ran the
following locator against an empty temporary directory:

```sh
LOCATOR_OUT=$(mktemp -d)

pixi run node recovery/scripts/analyze-bundles.mjs \
  --baseline "$ARTIFACTS/2.1.88/cli.js" \
  --map "$ARTIFACTS/2.1.88/cli.js.map" \
  --target "$ARTIFACTS/2.1.89/package/cli.js" \
  --output "$LOCATOR_OUT"
```

Its hunk/source-candidate output is exploratory navigation, not evidence.
For each candidate, inspect the exact target hunk and stable surrounding
literals, then define an unambiguous start/end-delimited fragment in
`manifest.json`. The verifier extracts and checks the byte length and
SHA-256 of all nine target fragments.

Translate only observable operators, literals, call order, and control flow
into both baseline source representations. Keep erased local names, types,
comments, and file placement explicitly inferred. Build differential tests
around target helpers that can be safely evaluated before emitting and
accepting the patches. This procedure recovered:

- exact `package.json` version change;
- exact `sdk-tools.d.ts` insertion;
- parser node discovery and argument extraction;
- parser-backed command splitting/help recognition;
- safe Bash `cat`/`sed` read caching;
- formatter/write markers;
- stale read-state detection and model hint; and
- BashTool integration.

Nine generated fragments in `manifest.json` pin these observations. The
recovered files are under `$CASE/recovered/`.

Two BashTool patches are intentionally alternatives:

- `BashTool.pristine.patch` targets
  `$BASELINE_EXTRACT/pristine/src`;
- `BashTool.bun-input.patch` targets this repository and
  `$BASELINE_EXTRACT/bun-input`.

`sdk-tools.pristine.patch` targets an extracted package workspace, not the
repository `src/` tree.

## 12. Apply the verified source-facing overlay to this repository

Starting from the verified 2.1.88 outer/Bun-input `src` layer, apply in this
order:

```sh
git apply --check "$CASE/recovered/bash-parser.pristine.patch"
git apply "$CASE/recovered/bash-parser.pristine.patch"

git apply --check "$CASE/recovered/BashTool.bun-input.patch"
git apply "$CASE/recovered/BashTool.bun-input.patch"
```

Do not also apply `BashTool.pristine.patch`; it is the alternate nested-source
representation.

Current `main` already contains this overlay. On an already-updated checkout,
verify its presence instead of applying it twice:

```sh
git apply --reverse --check \
  "$CASE/recovered/BashTool.bun-input.patch"
git apply --reverse --check \
  "$CASE/recovered/bash-parser.pristine.patch"
```

The resulting repository overlay is:

| Path | State | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `src/utils/bash/parser.ts` | patched | 6,983 | `128865ac92af89371351652fa88829398002171980425c8c2f2e9d7ca168d55e` |
| `src/utils/bash/commands.ts` | patched | 48,448 | `7c207fb9959cc807b677b27ef364b04b27368311ac19934796d66bf58ffe39f4` |
| `src/tools/BashTool/BashTool.tsx` | patched | 163,078 | `5a57584665e4f18af5009c6928afa7a0f3d34734a22a8e4b8645a4aeb8e11391` |
| `src/tools/BashTool/fileReadState.ts` | added | 5,242 | `3fa46f3b5e332616ec8a5ffab3dcea0299aaee527b12f3ef991c5a61f72d3029` |

Verify that the checked-in files equal a freshly patched outer source-map
tree:

```sh
pixi run node recovery/scripts/verify-recovered-patches.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$ARTIFACTS"
```

The verifier:

- extracts a new baseline;
- applies both the pristine and outer patch chains independently;
- checks exact package/declaration outputs;
- compares the four repository files with the fresh outer patch result;
- syntax-builds all four changed inputs in each source layer; and
- runs the target-backed semantic suite.

## 13. Reconstruct the exact 2.1.89 package tree

```sh
PACKAGE_PARENT=$(mktemp -d)
PACKAGE_OUT="$PACKAGE_PARENT/package"

pixi run node recovery/scripts/reconstruct-package.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --output "$PACKAGE_OUT"
```

The reconstruction:

1. copies the 16 unchanged authenticated baseline members;
2. omits `cli.js.map`;
3. applies the exact package version change;
4. applies the exact declaration insertion;
5. reconstructs `cli.js` from the Zstandard delta;
6. preserves target modes; and
7. compares every output member with the published 2.1.89 tarball.

Expected result:

```text
status                  exact-package-tree-reconstructed
members                 19
member bytes            43,022,346
framed tree SHA-256     cf6051611c5e7fca17e3bf8b9d7aa22d9da729388462fb3972a896ea29cea3b1
cli.js SHA-256          a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01
```

## 14. Run the single complete verification gate

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL"
```

Required statuses:

```text
complete-recovery-verified
evidence-verified
patches-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
readable-diff-verified
exact-package-tree-reconstructed
```

The final gate must report:

- source state `verified-recovered-overlay`;
- four applied source files;
- semantic criterion `compiled-ast-function-semantics-v1`;
- first-party semantic equivalence `true` with zero source-runtime gaps;
- whole-bundle semantic equivalence `false`, with the missing dependency and
  hermetic build inputs reported explicitly;
- 19 exact package members;
- zero unaccounted target UTF-16 units;
- 4,197,802 / 4,197,802 classified target tokens; and
- all tests passing with the target bundle supplied.

The semantic source ledger can also be checked independently:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --artifacts "$ARTIFACTS"
```

This applies the content-addressed semantic supplement at its introduction
commit, syntax-builds its 76 authored TypeScript inputs, verifies all 3,283
nonmatched target units (444 first-party runtime owners, 149 explicit
dependency/build-input gaps, and zero first-party gaps), and replays the exact
generated delta. `--require-exact-source` is intentionally fail-closed
because the published application dependency graph and production build
configuration are not recoverable from `src/` or the npm package.

## 15. Final repository checks and publication

Before committing:

```sh
git diff --check
find recovery -type f -name '*.mjs' -print0 |
  sort -z |
  xargs -0 -n1 pixi run node --check

CLAUDE_CODE_2_1_89_BUNDLE="$ARTIFACTS/2.1.89/package/cli.js" \
  pixi run npm --prefix recovery test
```

Review the exact staged scope, then commit and push:

```sh
git status --short
git diff --stat
git diff
git add \
  README.md \
  CLAUDE.md \
  recovery/README.md \
  recovery/cases/2.1.88-to-2.1.89/REPORT.md \
  recovery/cases/2.1.88-to-2.1.89/RECOVERY_RUNBOOK.md \
  recovery/cases/2.1.88-to-2.1.89/manifest.json \
  recovery/scripts/verify-case.mjs \
  recovery/scripts/verify-complete-recovery.mjs \
  recovery/scripts/verify-recovered-patches.mjs \
  src/utils/bash/parser.ts \
  src/utils/bash/commands.ts \
  src/tools/BashTool/BashTool.tsx \
  src/tools/BashTool/fileReadState.ts
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit
git push origin main
```

## Exploratory work that is not required

The session also used exploratory tools to understand the bundles:

- a `bun_graph`/graph view;
- naive normalized-token and statement diffs;
- temporary top-level AST statement dumps; and
- early literal-only candidate partitions.

These helped choose the final method but are not evidence gates. In
particular:

- literal equality does not prove surrounding code equality;
- blanket identifier normalization can hide operand, argument, binding, and
  property-value changes;
- the full normalized bundle diff cannot be applied to authored modules; and
- a successful behavioral test alone does not prove complete recovery.

The committed exact delta, package-member comparison, exhaustive attribution
inventory, structural ledger, bounded readable diff, patch chains, and
aggregate verifier replace those exploratory steps.
