# 2.1.90 V52 / Trial68: incomplete source checkpoint

This preserves every saved source input of the October 7, 2026 Trial68 candidate: 6,114 files, 50,693,348 bytes, including 1,933 Git-tracked source files and 31 additional src assets. It is a source snapshot for inspection and continuation. It is not an accepted recovery or a standalone build package.

The saved whole-program comparison still has 134 diagnostic residual regions. Whole-version, runtime, transitive-provider, global-binding and global-initialization acceptance remain false. The regions are not a bug count or a completion percentage. No new recovery edits, compiler run, application execution or whole-program comparison were performed for this export.

## Contents

- source-inputs.tar.gz: all 6,114 source inputs, including their saved dependency and license files, with deterministic regular-file metadata.
- source-manifest.json: complete per-file size and SHA-256 pins plus the original source-manifest identity.
- git-source-pins.json: the 1,933 source Git blobs and their original derived src tree.
- restoration.json: per-file restoration methods and saved evidence hash references.
- saved-backlog.csv: the 154 saved 2.1.90 planning rows, including 134 residual regions and the original qualified statuses. This is the October 7 snapshot; older decision rows are historical, not new requests for approval. The separate 2.1.89 recovery is not represented by this file.
- STATUS.json: explicit status and limitations.
- verify.py: a Python standard-library-only archive and Git-pin checker. It can optionally extract the verified files to a new directory; it does not execute archived source.

## Verify or unpack

From this directory, run `python3 -I -B verify.py`. To unpack after verification, run `python3 -I -B verify.py --output /path/to/new-directory`. The output directory must not already exist. These commands only hash, read and optionally write data. They install nothing and run no application or build.

Source bytes were restored from the saved candidate's own source-map sourcesContent and earlier saved source archives, admitting a file only when its exact byte length and SHA-256 matched the independently recorded Trial68 source manifest. No official target program was used as a source. All 1,933 Git source blobs and the src tree 23d9b6dbc2b8a583d71cb4ce78a77bdc574d7dad were independently recomputed. This proves fidelity to the saved candidate, not fidelity to the official program.

## Remaining limits

The complete historical profile, runtime reconstruction tools, generated executable outputs, target artifacts and private audit chain are outside this source-only snapshot. It therefore provides no build or runtime reproduction command. Reading and extracting this source archive does not require those private archives. Existing license notices are retained with their source files.

Historical Trial59/60 source maps remain unavailable, and original Trial61 evidence remains lost. Selected readable helper names are reconstruction choices, not a claim to recover original authorship. Bounded source/emission findings never promote whole-program or runtime acceptance. Continue from the exact saved inputs and the explicit backlog without weakening those boundaries.
