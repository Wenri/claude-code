# 2.1.90 V54: incomplete source checkpoint

This source-only checkpoint preserves all 6,114 sealed V54 source inputs (50,693,546 bytes), including 1,933 derived Git source pins and 31 additional src assets. It is derived from the published V53 checkpoint with exactly two source-file corrections: R018 in settings/changeDetector.ts and R129 in skills/skillChangeDetector.ts. The other 6,112 files are byte-identical; inherited R101/R102 changes remain present. This is not an accepted recovery or a standalone build package.

Fresh diagnostic compilation and complete actual-emission owner reviews recorded both bounded structural repairs. Raw owner names still differ at 26 occurrences for R018 and 24 for R129. Strict whole-program AST equality remains false. Provider, runtime, whole-version, global-binding and global-initialization acceptance remain false; no new region closure is accepted.

## Results and limits

- The fresh shape-based diagnostic partition has 130 windows, compared with 132 in V53 and 134 historically. Only the R018/R129 windows disappear relative to V53; no new target shape window or loss of an earlier matched shape pair was observed. These are diagnostic windows, not bugs, strict-AST unresolved regions or a completion percentage.
- The separate strict-statement partition changes from 231 gaps / 238 exact anchors in V53 to 206 gaps / 213 exact anchors. It loses 87 old exact pairs and gains 62 new pairs. The smaller gap count is not acceptance improvement: anchor churn and global compiler naming affect partition topology. Target and V54 have 3,110,206 and 3,110,727 AST nodes respectively.
- All 134 original historical residual records are retained without edits in saved-backlog.csv, alongside the other original planning rows. The V54 findings are supplemental; historical statuses and decision rows do not become new approvals or closures.
- The original root partition generator was not recovered. A compatibility difflib.SequenceMatcher partition with autojunk disabled exactly reproduces the saved V52 and V53 partitions before application to V54, including V52's 134 windows and 18,122 matched shape statements. V54 has 18,126 matched shape statements. The strict whole-program criterion was not weakened.
- V53-to-V54 strict digests change at 5,644 same-position statements. Only the two repaired owners change in shape. Complete static comparison of the other 5,642 statements finds identifier-name changes only, preserving all scoped graphs, protected fields and Literal.raw; complete selected capture maps have no collisions. These observations retain unresolved global naming/binding and supplier/initializer implications. No new nonlocal shape change was observed. This is not a no-runtime-regression proof.
- The prior bidi-js shorthand/capture-allocation finding in R17 remains explicit and unnormalized. A fresh check verifies that complete statement 5582 bytes are identical in V53 and V54, retaining the previous shorthand and wrapper-capture changes. The inherited report still records the V52-to-V53 comparison, and neither check is a global binding or runtime-equivalence proof.
- Inherited R101/R102 owners retain shape but change another 15 and two capture-name occurrences respectively. They are included in the fresh nonlocal check; no earlier literal-name result is silently reused as current raw equality.
- R091 remains unchanged and deferred because its source-provenance gap is unresolved. Its missing paragraph was not inserted.
- Watcher state/callback, caller/provider/initializer, host/builtin, reflective and global obligations remain open. Inherited virtual-scroll state/cache/callback and React/Ink scheduling obligations remain open too.

## Source provenance

Each new source edit replaces only one platform-specific split argument in a .git-component predicate with the separator regex already present in the pinned donor src/utils/plugins/loadPluginCommands.ts (line 77). The donor is unchanged from the public V53 source. Both full source diffs and donor hashes/expressions are recorded. The proposals' source-only derivation preceded target comparison, and the existing Chokidar normalization contract supports the hypothesis. These facts do not establish exact historical .90 source authorship or equivalence to the old Windows predicate.

## Contents

- source-inputs.tar.gz: the complete deterministic source archive, retaining dependency sources and licenses.
- source-manifest.json and git-source-pins.json: complete per-file byte/hash pins and data-derived Git blob/tree identities.
- restoration.json, source-changes.patch and source-origin-basis.json: exact public V53 baseline identity, source inheritance, both complete diffs and donor-source provenance.
- saved-backlog.csv: the unchanged 154-row historical planning snapshot, including all 134 residual records.
- STATUS.json: explicit incomplete status and acceptance limits.
- build-result-summary.json: safe hash/count summary of the recorded fresh five-stage diagnostic build. It predates the subsequent reviews and census; export itself performed no build.
- owner-review-summary.json: complete-owner structural/source-review results for R018/R129, with raw-name differences and unclosed obligations explicit.
- census-summary.json and diagnostic-windows.json: fresh diagnostic counts, complete strict-anchor churn pairs and all 130 supplemental windows with historical region correspondence.
- allocation-effects-summary.json and inherited-r17-side-effect-summary.json: current allocation limits and the preserved prior bidi-js finding.
- SHA256SUMS and verify.py: public file digests and a Python-standard-library data-only archive/Git-pin verifier.

## Verify or unpack

Run `python3 -I -B verify.py` from this directory. Optional extraction after verification uses `python3 -I -B verify.py --output /path/to/new-directory`; the destination must not already exist. These operations only read, hash and optionally write data. They install nothing and execute no archived source, build, callback, provider or application. SHA256SUMS covers all other files in this directory and should be checked against the trusted published revision.

The verifier establishes that the supplied source bytes match the pinned V54 checkpoint. It does not rerun the compiler, owner reviews or global census, or prove the official program equivalent. The derived src tree is 08a4e8830b927307a12fc3091cfc441678ef69c3; it is not a created or historical Git commit.

## Baseline and exclusions

The baseline is the [published V53 checkpoint](../v53-incomplete/README.md) at repository commit 02c5d4f32eed71f4d6df2189a8e1b695e4feecb8. Every V54 byte is either the identical public V53 byte at that path or part of one of the two fully recorded reviewed source edits. No official target bytes were used for source restoration. Selected readable helper names are reconstruction choices, not claims of original authorship.

Complete historical profiles, runtime reconstruction tools, official target bytes, generated application JS/maps, native binaries, credentials and raw nonpublic execution metadata are excluded. The source archive retains pre-existing pinned dependency JavaScript as source inputs. No private archives are required to read or extract it, but it supplies no standalone build or runtime-reproduction command. The summarized diagnostic evidence cannot be independently rerun from this source-only package alone.

Trial59/60 historical source maps remain unavailable, and original Trial61 evidence remains lost. Continue from these exact inputs and the preserved backlog without weakening the acceptance boundaries.
