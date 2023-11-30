// SSETransport, mcp/client, ssh, and dumpPrompts use DOM types
// (TextDecodeOptions, RequestInfo). tsconfig has lib: ["ESNext"] only; fixing
// those dependencies is a separate sweep, so preserve the status quo here.
/// <reference lib="dom" />

import chalk from 'chalk'
import { extname } from 'path'
import {
  ensureLanguage,
  getHljsCore,
} from './highlightLanguages/index.js'

export type CliHighlight = {
  highlight: (
    code: string,
    options?: {
      language?: string
    },
  ) => string
  supportsLanguage: (language: string) => boolean
}

type HljsNode = {
  scope?: string
  kind?: string
  children: (HljsNode | string)[]
}

type AnsiFormatter = (text: string) => string

const DEFAULT_THEME: Record<string, AnsiFormatter> = {
  keyword: chalk.blue,
  built_in: chalk.cyan,
  type: chalk.cyan.dim,
  literal: chalk.blue,
  number: chalk.green,
  regexp: chalk.red,
  string: chalk.red,
  subst: chalk.reset,
  symbol: chalk.reset,
  class: chalk.blue,
  function: chalk.yellow,
  title: chalk.reset,
  params: chalk.reset,
  comment: chalk.green,
  doctag: chalk.green,
  meta: chalk.grey,
  'meta-keyword': chalk.reset,
  'meta-string': chalk.reset,
  section: chalk.reset,
  tag: chalk.grey,
  name: chalk.blue,
  attr: chalk.cyan,
  attribute: chalk.reset,
  variable: chalk.reset,
  bullet: chalk.reset,
  code: chalk.reset,
  emphasis: chalk.italic,
  strong: chalk.bold,
  link: chalk.underline,
  quote: chalk.reset,
  addition: chalk.green,
  deletion: chalk.red,
}

function renderNode(node: HljsNode | string): string {
  if (typeof node === 'string') return node

  const text = node.children.map(renderNode).join('')
  const scope = node.scope ?? node.kind
  const formatter = scope
    ? DEFAULT_THEME[scope.replace(/^hljs-/, '')]
    : undefined
  return formatter ? formatter(text) : text
}

function highlight(
  code: string,
  options?: {
    language?: string
  },
): string {
  const requestedLanguage = options?.language
  if (!requestedLanguage) return code

  try {
    const language = ensureLanguage(requestedLanguage)
    if (!language) return code

    const result = getHljsCore().highlight(code, {
      language,
      ignoreIllegals: true,
    }) as {
      emitter?: {
        rootNode?: HljsNode | string
        root?: HljsNode | string
      }
      _emitter?: {
        rootNode?: HljsNode | string
        root?: HljsNode | string
      }
    }
    const emitter = result._emitter ?? result.emitter
    const root = emitter?.rootNode ?? emitter?.root
    if (!root || typeof root === 'string') return code
    return root.children.map(renderNode).join('')
  } catch {
    return code
  }
}

const cliHighlight: CliHighlight = {
  highlight,
  supportsLanguage: language => ensureLanguage(language) !== null,
}

// One promise shared by Fallback.tsx, markdown.ts, permission previews, and
// getLanguageName. Grammar registration remains synchronous and demand-driven.
let cliHighlightPromise: Promise<CliHighlight> | undefined

export function getCliHighlightPromise(): Promise<CliHighlight> {
  cliHighlightPromise ??= Promise.resolve(cliHighlight)
  return cliHighlightPromise
}

/**
 * eg. "foo/bar.ts" → "TypeScript". All callers are telemetry (OTel counter
 * attributes, permission-dialog unary events), so keep the async API even
 * though registration is now synchronous.
 */
export async function getLanguageName(file_path: string): Promise<string> {
  const ext = extname(file_path).slice(1)
  if (!ext) return 'unknown'

  const language = ensureLanguage(ext)
  if (!language) return 'unknown'
  return getHljsCore().getLanguage(language)?.name ?? 'unknown'
}
