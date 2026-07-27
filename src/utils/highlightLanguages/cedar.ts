import type { LanguageFn } from 'highlight.js'

const cedar: LanguageFn = hljs => ({
  name: 'Cedar',
  aliases: ['cedarpolicy'],
  keywords: {
    keyword: 'permit forbid when unless if then else in has like is',
    built_in:
      'principal action resource context decimal ip contains containsAll containsAny',
    literal: 'true false',
  },
  contains: [
    hljs.QUOTE_STRING_MODE,
    hljs.C_NUMBER_MODE,
    hljs.C_LINE_COMMENT_MODE,
    {
      className: 'meta',
      begin: /@\w+/,
    },
    {
      className: 'type',
      begin: /\b[A-Z]\w*(::[A-Z]\w*)*/,
    },
  ],
})

export default cedar
