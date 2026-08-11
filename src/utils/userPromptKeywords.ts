/**
 * Checks if input matches negative keyword patterns
 */
export function matchesNegativeKeyword(input: string): boolean {
  const lowerInput = input.toLowerCase()

  const negativePattern =
    /\b(wtf|wth|ffs|omfg|shit(ty|tiest)?|dumbass|horrible|awful|piss(ed|ing)? off|piece of (shit|crap|junk)|what the (fuck|hell)|fucking? (broken|useless|terrible|awful|horrible)|fuck you|screw (this|you)|so frustrating|this sucks|damn it)\b/

  return negativePattern.test(lowerInput)
}

/**
 * Checks if input matches keep going/continuation patterns
 */
export function matchesKeepGoingKeyword(input: string): boolean {
  const lowerInput = input.toLowerCase().trim()

  // Match "continue" only if it's the entire prompt
  if (lowerInput === 'continue') {
    return true
  }

  // Match "keep going" or "go on" anywhere in the input
  const keepGoingPattern = /\b(keep going|go on)\b/
  return keepGoingPattern.test(lowerInput)
}

const WAKEUP_KEYWORDS = new Set([
  'ping',
  'u there',
  'you there',
  'are you there',
  'r u there',
  'u here',
  'you here',
  'are you here',
  'you back',
  'are you back',
  'u back',
  'anyone there',
  'anybody there',
  'still there',
  'you still there',
  'are you still there',
  'still working',
  'you still working',
  'are you still working',
  'you stuck',
  'are you stuck',
  'u stuck',
  '喂',
  '在吗',
  '在嗎',
  '还在吗',
  '還在嗎',
  '在不在',
  'もしもし',
  'おい',
  'おーい',
  'いますか',
  '여보세요',
  '야',
  '있어요',
  'hola',
  'oye',
  'estás ahí',
  'estas ahi',
  'sigues ahí',
  'sigues ahi',
  'oi',
  'olá',
  'ola',
  'alô',
  'alo',
  'tá aí',
  'ta ai',
  'está aí',
  'esta ai',
  'allo',
  'allô',
  'salut',
  'coucou',
  "t'es là",
  "t'es la",
  'tu es là',
  'tu es la',
  'hallo',
  'bist du da',
  'noch da',
  'привет',
  'эй',
  'алло',
  'ты тут',
  'ciao',
  'ehi',
  'ci sei',
])

/** Checks for short prompts whose sole purpose is to see whether Claude is responsive. */
export function matchesWakeupKeyword(input: string): boolean {
  const trimmed = input.trim()
  if (trimmed.length > 40) return false
  if (/^(\?+|\.{2,}|…+)$/u.test(trimmed)) return true

  const normalized = trimmed
    .toLowerCase()
    .replace(/^[¿¡]+|[?!.¿¡？！。…]+$/gu, '')
    .trim()
  if (/^(hi+|hello+|he+y+|yo+)$/.test(normalized)) return true
  return WAKEUP_KEYWORDS.has(normalized)
}
