// Extracted from dream.ts so auto-dream ships independently of KAIROS
// feature flags (dream.ts is behind a feature()-gated require).

import {
  DIR_EXISTS_GUIDANCE,
  ENTRYPOINT_NAME,
  MAX_ENTRYPOINT_LINES,
} from '../../memdir/memdir.js'

const TEAM_MEMORY_GUIDANCE = `## Team memory (\`team/\` subdirectory)

The \`team/\` subdirectory holds memories shared across everyone working in this repo. Other teammates' Claude sessions write here too — treat it differently from your personal files:

- **Phase 1:** \`ls team/\` and skim it alongside your personal files. A teammate may have already captured something you'd otherwise duplicate.
- **Phase 3:** Merge near-duplicates *within* \`team/\` the same way you would personal memories. If a personal memory restates a team memory, delete the personal one.
- **Phase 4 — be conservative pruning \`team/\`:**
  - DO delete or fix a team memory that is clearly contradicted by the current code, or that a newer team memory marks as superseded.
  - DO NOT delete a team memory just because you don't recognize it or it isn't relevant to *your* recent sessions — a teammate may rely on it.
  - When unsure, leave it. A stale team memory costs little; deleting a teammate's load-bearing note costs a lot.

Do not promote personal memories into \`team/\` during a dream — that's a deliberate choice the user makes via \`/remember\`, not something to do reflexively.`

const RECONCILE_MEMORIES_AGAINST_CLAUDE_MD = `### Reconcile memories against CLAUDE.md

Project CLAUDE.md instructions are loaded in your system prompt. For each \`feedback\` or \`project\` memory, check whether it contradicts a CLAUDE.md instruction on the same topic:

- **Memory is stale** — CLAUDE.md and the memory describe different procedures for the same task: CLAUDE.md is the maintained, checked-in source. Delete the memory, or rewrite it to agree if it carries context worth keeping (the *why* is still useful but the *how* is wrong).
- **CLAUDE.md may be stale** — the memory is clearly dated after CLAUDE.md and explicitly corrects it: do NOT edit CLAUDE.md during a dream. Annotate the memory with "contradicts CLAUDE.md — verify which is current" and list it in your summary so the user can update CLAUDE.md.
- **Not a conflict** — the memory adds detail CLAUDE.md doesn't cover, or narrows a CLAUDE.md rule with a stated reason. Leave it.

A \`feedback\` memory's "Why: the user corrected me" framing is not evidence it's newer than CLAUDE.md — CLAUDE.md may have been updated since.`

export function buildPruningPrompt(
  memoryRoot: string,
  extra: string,
  teamMemoryEnabled = false,
): string {
  return `# Dream: Memory Pruning

You are performing a dream — a pruning pass over your memory files. The job is small: delete stale or invalidated memories, and collapse duplicates.

Memory directory: \`${memoryRoot}\`
${DIR_EXISTS_GUIDANCE}

Memory files are immutable: never edit them in place. Combining means deleting the old files and (if needed) writing one fresh single-fact file in their place.

## What to do

1. \`find ${memoryRoot} -name '*.md'\` to enumerate every memory file (including any \`team/\` subdirectory).
2. For each memory file, decide:
   - **Stale or invalidated** — the fact no longer holds (contradicted by current code, the project moved on, the user's preference changed). Delete the file.
   - **Duplicate or near-duplicate** — another memory already covers the same fact. Delete the redundant copies. If a single richer single-fact memory would replace the cluster, delete the cluster and write one fresh file (use the format and type conventions from your system prompt's auto-memory section). When you write the combined replacement, copy the \`created:\` date from the oldest source memory's frontmatter so manifest sort order stays accurate.
   - **Still good** — leave it alone.${teamMemoryEnabled ? "\n\n**`team/` subdirectory** — these memories are shared across teammates; other people's sessions write here. Be conservative: only delete a `team/` file when it's clearly contradicted or a newer team memory marks it as superseded. Do NOT delete a team memory just because you don't recognize it or it isn't relevant to your recent sessions — a teammate may rely on it. Do not move personal memories into `team/`." : ''}

Return a brief summary of what you deleted, combined, or left alone. If nothing changed, say so.${extra ? `\n\n## Additional context\n\n${extra}` : ''}`
}

export function buildConsolidationPrompt(
  memoryRoot: string,
  transcriptDir: string,
  extra: string,
  teamMemoryEnabled = false,
): string {
  return `# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly.

Memory directory: \`${memoryRoot}\`
${DIR_EXISTS_GUIDANCE}

Session transcripts: \`${transcriptDir}\` (large JSONL files — grep narrowly, don't read whole files)
${teamMemoryEnabled ? `\n${TEAM_MEMORY_GUIDANCE}\n` : ''}
---

## Phase 1 — Orient

- \`ls\` the memory directory to see what already exists
- Read \`${ENTRYPOINT_NAME}\` to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates
- \`ls logs/\` — recent daily activity logs (one file per day). If a \`sessions/\` subdirectory also exists, review recent entries there too

## Phase 2 — Gather recent signal

Look for new information worth persisting. Sources in rough priority order:

1. **Daily logs** (\`logs/YYYY/MM/YYYY-MM-DD.md\`) — the append-only activity stream. Read the most recent 1–3 days; each line is prefix-coded (\`>\` user, \`<\` assistant, \`.\` tool call)
2. **Existing memories that drifted** — facts that contradict something you see in the codebase now
3. **Transcript search** — if you need specific context (e.g., "what was the error message from yesterday's build failure?"), grep the JSONL transcripts for narrow terms:
   \`grep -rn "<narrow term>" ${transcriptDir}/ --include="*.jsonl" | tail -50\`

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 — Consolidate

For each thing worth remembering, write or update a memory file at the top level of the memory directory. Use the memory file format and type conventions from your system prompt's auto-memory section — it's the source of truth for what to save, how to structure it, and what NOT to save.

Focus on:
- Merging new signal into existing topic files rather than creating near-duplicates
- Converting relative dates ("yesterday", "last week") to absolute dates so they remain interpretable after time passes
- Deleting contradicted facts — if today's investigation disproves an old memory, fix it at the source

## Phase 4 — Prune and index

Update \`${ENTRYPOINT_NAME}\` so it stays under ${MAX_ENTRYPOINT_LINES} lines AND under ~25KB. It's an **index**, not a dump — each entry should be one line under ~150 characters: \`- [Title](file.md) — one-line hook\`. Never write memory content directly into it.

- Remove pointers to memories that are now stale, wrong, or superseded
- Demote verbose entries: if an index line is over ~200 chars, it's carrying content that belongs in the topic file — shorten the line, move the detail
- Add pointers to newly important memories
- Resolve contradictions — if two files disagree, fix the wrong one

${RECONCILE_MEMORIES_AGAINST_CLAUDE_MD}

---

Return a brief summary of what you consolidated, updated, or pruned. If nothing changed (memories are already tight), say so.${extra ? `\n\n## Additional context\n\n${extra}` : ''}`
}
