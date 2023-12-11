# Generated-change attribution inventory

`inventory-generated-change.mjs` produces a deterministic, machine-readable
inventory for a mapped baseline bundle and an unmapped target bundle. It keeps
exact facts separate from heuristic attribution:

1. Decode every baseline source-map segment and require exactly one contiguous
   generated run for every source.
2. Locate unique exact literals shared by the two bundles. A longest increasing
   subsequence supplies order-preserving anchors; non-monotone anchors remain
   available as relocation evidence.
3. Partition every target offset between anchors and classify it as exact
   generated text, a high-confidence same-source change, a source-candidate
   change, or unresolved.
4. Discover Bun's generated ESM/CommonJS wrapper names in each bundle and
   inventory every target initializer region with source and baseline-unit
   votes.
5. Hash every input and output and record optional package, declaration, and
   changelog evidence.

All generated offsets and lengths are JavaScript UTF-16 code units.

## Run

```sh
node recovery/attribution/inventory-generated-change.mjs \
  --baseline /path/to/2.1.88/cli.js \
  --map /path/to/2.1.88/cli.js.map \
  --target /path/to/2.1.89/cli.js \
  --output /path/to/report \
  --target-package-json /path/to/2.1.89/package.json \
  --target-dts /path/to/2.1.89/sdk-tools.d.ts \
  --changelog /path/to/CHANGELOG.md
```

The output directory must be absent or empty. `--minimum-literal-length`
defaults to 8.

## Output and verification

- `summary.json`: input identities, method counts, coverage invariants, release
  evidence, output hashes, and limitations.
- `sources.jsonl.gz`: one row for every baseline source-map ownership run, with
  target literal clusters and partition evidence.
- `target-initializers.jsonl.gz`: one row for every discovered target Bun
  initializer region.
- `target-partitions.jsonl.gz`: exhaustive between-anchor generated-text
  partitions, with hashes, candidates, and confidence.

Basic integrity checks:

```sh
jq '.coverage | {
  accountedTargetUtf16,
  targetUtf16,
  unaccountedTargetUtf16
}' /path/to/report/summary.json

for file in /path/to/report/*.jsonl.gz; do
  gzip -t "$file"
  gzip -cd "$file" | jq -c . >/dev/null
done
```

The required invariant is
`accountedTargetUtf16 == targetUtf16 && unaccountedTargetUtf16 == 0`.
Exact baseline ownership comes from the verified source map. Target source
identities are evidence-ranked and intentionally remain unresolved where the
bundle supplies insufficient evidence.
