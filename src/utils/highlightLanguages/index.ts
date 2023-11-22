import type { HLJSApi, LanguageFn } from 'highlight.js'
import cedar from './cedar.js'

const extraLanguages: Record<string, LanguageFn> = {
  cedar,
}

export function registerExtraLanguages(hljs: HLJSApi): void {
  for (const [name, language] of Object.entries(extraLanguages)) {
    if (!hljs.getLanguage(name)) {
      hljs.registerLanguage(name, language)
    }
  }
}
