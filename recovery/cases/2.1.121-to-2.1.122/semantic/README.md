# Claude Code 2.1.122 semantic recovery proof

This directory is intentionally incomplete at the acquisition checkpoint. The
authenticated non-source case reconstructs the published wrapper package and
embedded JavaScript graph exactly, but it does not claim that the source tree
has recovered the 2.1.122 semantics.

The proof closes only after all of these fail-closed gates succeed:

1. `recovery/2.1.122-direct-evidence-specs.json` is regenerated with
   `--final`; every coverage declaration is true and every row has exact
   adjacent-bundle, source, and focused-test evidence.
2. `build-2.1.122-direct-evidence.mjs` rejects any unbound changed `src` path,
   any unbound 2.1.122 focused test, any missing witness, and any false
   retained marker.
3. `recovery-2.1.122-direct-evidence.test.mjs` is pinned to the final catalog
   byte length and SHA-256. Its zero/zero provisional pin deliberately fails.
4. Source lineage, a reversible overlay, semantic obligations, correspondence,
   final documentation, and the aggregate manifest remain absent until the
   recovered source commit is immutable and the residual audit is zero.

No source identity is inferred from minified names. Row evidence must use exact
counts in both authenticated adjacent `cli.inner.js` artifacts and exact
source fragments or explicit source-path absences.

The exact extracted changelog section intentionally retains its separator
blank line. Consequently `git diff --check` has one acquisition-metadata
diagnostic and no others:

`recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md:21: new blank line at EOF.`

The final source freeze must pin the exact 91-byte diagnostic stream SHA-256
`1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902`,
while continuing to require zero diagnostics under `src/`.
