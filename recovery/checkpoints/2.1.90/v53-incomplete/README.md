# 2.1.90 V53: incomplete source checkpoint

This source-only checkpoint preserves all 6,114 sealed V53 source inputs (50,693,564 bytes), including 1,933 derived Git source pins and 31 additional src assets. It is derived from the published V52 checkpoint with exactly two source-file corrections: R101 in useVirtualScroll.ts and R102 in FullscreenLayout.tsx. The other 6,112 files are byte-identical. This is not an accepted recovery or a standalone build package.

Fresh diagnostic compilation and complete actual-emission owner reviews recorded both bounded structural repairs. Raw owner names still differ. Strict whole-program AST equality remains false. Provider, runtime, whole-version, global-binding and global-initialization acceptance remain false; no new region closure is accepted.

## Results and limits

- The fresh shape-based diagnostic partition has 132 windows, compared with 134 historically. Only the R101/R102 windows disappeared; no new target shape window or loss of an earlier matched shape pair was observed. These are diagnostic windows, not bugs, strict-AST unresolved regions or a completion percentage.
- The separate strict-statement diagnostic partition still has 231 gaps and 238 exact statement anchors. Target and V53 have 3,110,206 and 3,110,731 AST nodes respectively.
- All 134 original historical residual records are retained without edits in saved-backlog.csv, alongside the other original planning rows. The V53 findings are supplemental; historical statuses and decision rows do not become new approvals or closures.
- The original root partition generator was not recovered. A compatibility difflib.SequenceMatcher partition with autojunk disabled exactly reproduces all 134 saved V52 windows and 18,122 matched statements before application to V53. V53 has 18,124 matched shape statements. The strict whole-program criterion was not weakened.
- A compiler-allocation side effect remains in unchanged bidi-js within historical R17: statement 5582 changes Property.shorthand from false to true and the wrapper capture from p to B. The 4,006-node statement's complete 108-scope graph remains equal, as do the wrapper's scoped fields and graph. The shorthand field is retained, with no generic normalization; raw strict and shape equality remain false.
- V52-to-V53 strict digests change at 3,118 same-position statements. Only three change in shape: R17's statement 5582 and the two repaired owners. The other 3,115 shape-stable changes retain unresolved global naming/binding implications.
- The shared virtual-scroll state/cache/callback, caller/provider/initializer, React/Ink scheduling, reflective and global obligations remain open. Source comments are preserved literally; their timing claims do not establish behavior equivalence.

## Contents

- source-inputs.tar.gz: the complete deterministic source archive, retaining dependency sources and licenses. No recovered application is executed by packaging or verification.
- source-manifest.json and git-source-pins.json: complete per-file byte/hash pins and data-derived Git blob/tree identities.
- restoration.json and source-changes.patch: exact public V52 baseline identity, all source-inheritance rules and the two complete source diffs.
- saved-backlog.csv: the unchanged 154-row historical planning snapshot, including all 134 residual records.
- STATUS.json: explicit incomplete status and acceptance limits.
- build-result-summary.json: safe hash/count summary of the recorded fresh five-stage diagnostic build. It predates the subsequent reviews and census; export itself performed no build.
- owner-review-summary.json: complete-owner structural/source-review results for R101/R102, with raw-name differences and unclosed obligations explicit.
- census-summary.json and diagnostic-windows.json: fresh diagnostic counts and all 132 supplemental windows, with historical region correspondence.
- r17-side-effect-summary.json: retained bidi-js shorthand/capture-allocation diagnosis.
- SHA256SUMS and verify.py: public file digests and a Python-standard-library data-only archive/Git-pin verifier.

## Verify or unpack

Run `python3 -I -B verify.py` from this directory. Optional extraction after verification uses `python3 -I -B verify.py --output /path/to/new-directory`; the destination must not already exist. These operations only read, hash and optionally write data. They install nothing and execute no archived source, build, callback, provider or application. SHA256SUMS covers all other files in this directory and should be checked against the trusted published revision.

The verifier establishes that the supplied source bytes match the pinned V53 checkpoint. It does not rerun the compiler, owner reviews or global census, or prove the official program equivalent. The derived src tree is ffdf1cbf8bfe8ac40634d804331b4bc9bd29c892; it is not a created or historical Git commit.

## Provenance and exclusions

The baseline is the [published V52 checkpoint](../v52-incomplete/README.md) at repository commit 49a399849c05d296ee904dd163bc937a0a94a90c. Every V53 byte is either the identical public V52 byte at that path or part of one of the two fully recorded reviewed source edits. No official target bytes were used for source restoration. Selected readable helper names are reconstruction choices, not claims of original authorship.

Complete historical profiles, runtime reconstruction tools, official target bytes, generated application JS/maps, credentials and raw nonpublic execution metadata are excluded. The source archive retains pre-existing pinned dependency JavaScript as source inputs. No private archives are required to read or extract it, but it supplies no standalone build or runtime-reproduction command. The summarized diagnostic evidence cannot be independently rerun from this source-only package alone.

Trial59/60 historical source maps remain unavailable, and original Trial61 evidence remains lost. Continue from these exact inputs and the preserved backlog without weakening the acceptance boundaries.
