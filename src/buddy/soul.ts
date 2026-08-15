import { z } from 'zod/v4'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { sideQuery } from '../utils/sideQuery.js'
import { jsonParse } from '../utils/slowOperations.js'
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js'
import {
  type CompanionBones,
  type CompanionSoul,
  STAT_NAMES,
} from './types.js'

const SOUL_SCHEMA = z.strictObject({
  name: z.string().min(1).max(14),
  personality: z.string(),
})

export const SOUL_SYSTEM_PROMPT = `You generate coding companions — small creatures that live in a developer's terminal and occasionally comment on their work.

Given a rarity, species, stats, and a handful of inspiration words, invent:
- A name: ONE word, max 12 characters. Memorable, slightly absurd. No titles, no "the X", no epithets. Think pet name, not NPC name. The inspiration words are loose anchors — riff on one, mash two syllables, or just use the vibe. Examples: Pith, Dusker, Crumb, Brogue, Sprocket.
- A one-sentence personality (specific, funny, a quirk that affects how they'd comment on code — should feel consistent with the stats)

Higher rarity = weirder, more specific, more memorable. A legendary should be genuinely strange.
Don't repeat yourself — every companion should feel distinct.`

export const INSPIRATION_WORDS = [
  'thunder', 'biscuit', 'void', 'accordion', 'moss', 'velvet', 'rust',
  'pickle', 'crumb', 'whisper', 'gravy', 'frost', 'ember', 'soup', 'marble',
  'thorn', 'honey', 'static', 'copper', 'dusk', 'sprocket', 'bramble',
  'cinder', 'wobble', 'drizzle', 'flint', 'tinsel', 'murmur', 'clatter',
  'gloom', 'nectar', 'quartz', 'shingle', 'tremor', 'umber', 'waffle',
  'zephyr', 'bristle', 'dapple', 'fennel', 'gristle', 'huddle', 'kettle',
  'lumen', 'mottle', 'nuzzle', 'pebble', 'quiver', 'ripple', 'sable',
  'thistle', 'vellum', 'wicker', 'yonder', 'bauble', 'cobble', 'doily',
  'fickle', 'gambit', 'hubris', 'jostle', 'knoll', 'larder', 'mantle',
  'nimbus', 'oracle', 'plinth', 'quorum', 'relic', 'spindle', 'trellis',
  'urchin', 'vortex', 'warble', 'xenon', 'yoke', 'zenith', 'alcove',
  'brogue', 'chisel', 'dirge', 'epoch', 'fathom', 'glint', 'hearth',
  'inkwell', 'jetsam', 'kiln', 'lattice', 'mirth', 'nook', 'obelisk',
  'parsnip', 'quill', 'rune', 'sconce', 'tallow', 'umbra', 'verve', 'wisp',
  'yawn', 'apex', 'brine', 'crag', 'dregs', 'etch', 'flume', 'gable', 'husk',
  'ingot', 'jamb', 'knurl', 'loam', 'mote', 'nacre', 'ogle', 'prong', 'quip',
  'rind', 'slat', 'tuft', 'vane', 'welt', 'yarn', 'bane', 'clove', 'dross',
  'eave', 'fern', 'grit', 'hive', 'jade', 'keel', 'lilt', 'muse', 'nape',
  'omen', 'pith', 'rook', 'silt', 'tome', 'urge', 'vex', 'wane', 'yew', 'zest',
] as const

const FALLBACK_NAMES = ['Crumpet', 'Soup', 'Pickle', 'Biscuit', 'Moth', 'Gravy']

export function selectInspirationWords(seed: number, count: number): string[] {
  let state = seed >>> 0
  const selected = new Set<number>()
  while (selected.size < count) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    selected.add(state % INSPIRATION_WORDS.length)
  }
  return [...selected].map(index => INSPIRATION_WORDS[index]!)
}

export async function generateCompanionSoul(
  bones: CompanionBones,
  inspirationSeed: number,
  signal?: AbortSignal,
): Promise<CompanionSoul> {
  const inspiration = selectInspirationWords(inspirationSeed, 4)
  const stats = STAT_NAMES
    .map(name => `${name}:${bones.stats[name]}`)
    .join(' ')
  const prompt = `Generate a companion.
Rarity: ${bones.rarity.toUpperCase()}
Species: ${bones.species}
Stats: ${stats}
Inspiration words: ${inspiration.join(', ')}
${bones.shiny ? 'SHINY variant — extra special.' : ''}

Make it memorable and distinct.`

  try {
    const response = await sideQuery({
      querySource: 'buddy_companion',
      model: getSmallFastModel(),
      system: SOUL_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [{ role: 'user', content: prompt }],
      output_format: {
        type: 'json_schema',
        schema: zodToJsonSchema(SOUL_SCHEMA),
      },
      max_tokens: 512,
      temperature: 1,
      signal,
    })
    const text = response.content.find(block => block.type === 'text')?.text ?? ''
    logForDebugging(`[buddy] soul response: ${text.slice(0, 200)}`)
    if (!text) {
      throw new Error(
        `no text block in response, got: ${response.content.map(block => block.type).join(',')}`,
      )
    }
    const parsed = SOUL_SCHEMA.safeParse(jsonParse(text))
    if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.message}`)
    return parsed.data
  } catch (error) {
    logError(error)
    return fallbackCompanionSoul(bones)
  }
}

export function fallbackCompanionSoul(bones: CompanionBones): CompanionSoul {
  const index = bones.species.charCodeAt(0) + bones.eye.charCodeAt(0)
  return {
    name: FALLBACK_NAMES[index % FALLBACK_NAMES.length]!,
    personality: `A ${bones.rarity} ${bones.species} of few words.`,
  }
}
