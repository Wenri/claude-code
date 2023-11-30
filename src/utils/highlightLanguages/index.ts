import type { HLJSApi, LanguageFn } from 'highlight.js'
import { logError } from '../log.js'
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

type LanguageModule =
  | LanguageFn
  | {
      default?: LanguageFn
    }

type LanguageLoader = () => LanguageModule

// Keep these loaders explicit so the production bundler includes every
// grammar while deferring module evaluation and registration until requested.
/* eslint-disable @typescript-eslint/no-require-imports */
const languageLoaders: Record<string, LanguageLoader> = {
  '1c': () => require('highlight.js/lib/languages/1c'),
  abnf: () => require('highlight.js/lib/languages/abnf'),
  accesslog: () => require('highlight.js/lib/languages/accesslog'),
  actionscript: () => require('highlight.js/lib/languages/actionscript'),
  ada: () => require('highlight.js/lib/languages/ada'),
  angelscript: () => require('highlight.js/lib/languages/angelscript'),
  apache: () => require('highlight.js/lib/languages/apache'),
  applescript: () => require('highlight.js/lib/languages/applescript'),
  arcade: () => require('highlight.js/lib/languages/arcade'),
  arduino: () => require('highlight.js/lib/languages/arduino'),
  armasm: () => require('highlight.js/lib/languages/armasm'),
  asciidoc: () => require('highlight.js/lib/languages/asciidoc'),
  aspectj: () => require('highlight.js/lib/languages/aspectj'),
  autohotkey: () => require('highlight.js/lib/languages/autohotkey'),
  autoit: () => require('highlight.js/lib/languages/autoit'),
  avrasm: () => require('highlight.js/lib/languages/avrasm'),
  awk: () => require('highlight.js/lib/languages/awk'),
  axapta: () => require('highlight.js/lib/languages/axapta'),
  bash: () => require('highlight.js/lib/languages/bash'),
  basic: () => require('highlight.js/lib/languages/basic'),
  bnf: () => require('highlight.js/lib/languages/bnf'),
  brainfuck: () => require('highlight.js/lib/languages/brainfuck'),
  c: () => require('highlight.js/lib/languages/c'),
  'c-like': () => require('highlight.js/lib/languages/c-like'),
  cal: () => require('highlight.js/lib/languages/cal'),
  capnproto: () => require('highlight.js/lib/languages/capnproto'),
  ceylon: () => require('highlight.js/lib/languages/ceylon'),
  clean: () => require('highlight.js/lib/languages/clean'),
  clojure: () => require('highlight.js/lib/languages/clojure'),
  'clojure-repl': () => require('highlight.js/lib/languages/clojure-repl'),
  cmake: () => require('highlight.js/lib/languages/cmake'),
  coffeescript: () => require('highlight.js/lib/languages/coffeescript'),
  coq: () => require('highlight.js/lib/languages/coq'),
  cos: () => require('highlight.js/lib/languages/cos'),
  cpp: () => require('highlight.js/lib/languages/cpp'),
  crmsh: () => require('highlight.js/lib/languages/crmsh'),
  crystal: () => require('highlight.js/lib/languages/crystal'),
  csharp: () => require('highlight.js/lib/languages/csharp'),
  csp: () => require('highlight.js/lib/languages/csp'),
  css: () => require('highlight.js/lib/languages/css'),
  d: () => require('highlight.js/lib/languages/d'),
  dart: () => require('highlight.js/lib/languages/dart'),
  delphi: () => require('highlight.js/lib/languages/delphi'),
  diff: () => require('highlight.js/lib/languages/diff'),
  django: () => require('highlight.js/lib/languages/django'),
  dns: () => require('highlight.js/lib/languages/dns'),
  dockerfile: () => require('highlight.js/lib/languages/dockerfile'),
  dos: () => require('highlight.js/lib/languages/dos'),
  dsconfig: () => require('highlight.js/lib/languages/dsconfig'),
  dts: () => require('highlight.js/lib/languages/dts'),
  dust: () => require('highlight.js/lib/languages/dust'),
  ebnf: () => require('highlight.js/lib/languages/ebnf'),
  elixir: () => require('highlight.js/lib/languages/elixir'),
  elm: () => require('highlight.js/lib/languages/elm'),
  erb: () => require('highlight.js/lib/languages/erb'),
  erlang: () => require('highlight.js/lib/languages/erlang'),
  'erlang-repl': () => require('highlight.js/lib/languages/erlang-repl'),
  excel: () => require('highlight.js/lib/languages/excel'),
  fix: () => require('highlight.js/lib/languages/fix'),
  flix: () => require('highlight.js/lib/languages/flix'),
  fortran: () => require('highlight.js/lib/languages/fortran'),
  fsharp: () => require('highlight.js/lib/languages/fsharp'),
  gams: () => require('highlight.js/lib/languages/gams'),
  gauss: () => require('highlight.js/lib/languages/gauss'),
  gcode: () => require('highlight.js/lib/languages/gcode'),
  gherkin: () => require('highlight.js/lib/languages/gherkin'),
  glsl: () => require('highlight.js/lib/languages/glsl'),
  gml: () => require('highlight.js/lib/languages/gml'),
  go: () => require('highlight.js/lib/languages/go'),
  golo: () => require('highlight.js/lib/languages/golo'),
  gradle: () => require('highlight.js/lib/languages/gradle'),
  groovy: () => require('highlight.js/lib/languages/groovy'),
  haml: () => require('highlight.js/lib/languages/haml'),
  handlebars: () => require('highlight.js/lib/languages/handlebars'),
  haskell: () => require('highlight.js/lib/languages/haskell'),
  haxe: () => require('highlight.js/lib/languages/haxe'),
  hsp: () => require('highlight.js/lib/languages/hsp'),
  htmlbars: () => require('highlight.js/lib/languages/htmlbars'),
  http: () => require('highlight.js/lib/languages/http'),
  hy: () => require('highlight.js/lib/languages/hy'),
  inform7: () => require('highlight.js/lib/languages/inform7'),
  ini: () => require('highlight.js/lib/languages/ini'),
  irpf90: () => require('highlight.js/lib/languages/irpf90'),
  isbl: () => require('highlight.js/lib/languages/isbl'),
  java: () => require('highlight.js/lib/languages/java'),
  javascript: () => require('highlight.js/lib/languages/javascript'),
  'jboss-cli': () => require('highlight.js/lib/languages/jboss-cli'),
  json: () => require('highlight.js/lib/languages/json'),
  julia: () => require('highlight.js/lib/languages/julia'),
  'julia-repl': () => require('highlight.js/lib/languages/julia-repl'),
  kotlin: () => require('highlight.js/lib/languages/kotlin'),
  lasso: () => require('highlight.js/lib/languages/lasso'),
  latex: () => require('highlight.js/lib/languages/latex'),
  ldif: () => require('highlight.js/lib/languages/ldif'),
  leaf: () => require('highlight.js/lib/languages/leaf'),
  less: () => require('highlight.js/lib/languages/less'),
  lisp: () => require('highlight.js/lib/languages/lisp'),
  livecodeserver: () => require('highlight.js/lib/languages/livecodeserver'),
  livescript: () => require('highlight.js/lib/languages/livescript'),
  llvm: () => require('highlight.js/lib/languages/llvm'),
  lsl: () => require('highlight.js/lib/languages/lsl'),
  lua: () => require('highlight.js/lib/languages/lua'),
  makefile: () => require('highlight.js/lib/languages/makefile'),
  markdown: () => require('highlight.js/lib/languages/markdown'),
  mathematica: () => require('highlight.js/lib/languages/mathematica'),
  matlab: () => require('highlight.js/lib/languages/matlab'),
  maxima: () => require('highlight.js/lib/languages/maxima'),
  mel: () => require('highlight.js/lib/languages/mel'),
  mercury: () => require('highlight.js/lib/languages/mercury'),
  mipsasm: () => require('highlight.js/lib/languages/mipsasm'),
  mizar: () => require('highlight.js/lib/languages/mizar'),
  mojolicious: () => require('highlight.js/lib/languages/mojolicious'),
  monkey: () => require('highlight.js/lib/languages/monkey'),
  moonscript: () => require('highlight.js/lib/languages/moonscript'),
  n1ql: () => require('highlight.js/lib/languages/n1ql'),
  nginx: () => require('highlight.js/lib/languages/nginx'),
  nim: () => require('highlight.js/lib/languages/nim'),
  nix: () => require('highlight.js/lib/languages/nix'),
  'node-repl': () => require('highlight.js/lib/languages/node-repl'),
  nsis: () => require('highlight.js/lib/languages/nsis'),
  objectivec: () => require('highlight.js/lib/languages/objectivec'),
  ocaml: () => require('highlight.js/lib/languages/ocaml'),
  openscad: () => require('highlight.js/lib/languages/openscad'),
  oxygene: () => require('highlight.js/lib/languages/oxygene'),
  parser3: () => require('highlight.js/lib/languages/parser3'),
  perl: () => require('highlight.js/lib/languages/perl'),
  pf: () => require('highlight.js/lib/languages/pf'),
  pgsql: () => require('highlight.js/lib/languages/pgsql'),
  php: () => require('highlight.js/lib/languages/php'),
  'php-template': () => require('highlight.js/lib/languages/php-template'),
  plaintext: () => require('highlight.js/lib/languages/plaintext'),
  pony: () => require('highlight.js/lib/languages/pony'),
  powershell: () => require('highlight.js/lib/languages/powershell'),
  processing: () => require('highlight.js/lib/languages/processing'),
  profile: () => require('highlight.js/lib/languages/profile'),
  prolog: () => require('highlight.js/lib/languages/prolog'),
  properties: () => require('highlight.js/lib/languages/properties'),
  protobuf: () => require('highlight.js/lib/languages/protobuf'),
  puppet: () => require('highlight.js/lib/languages/puppet'),
  purebasic: () => require('highlight.js/lib/languages/purebasic'),
  python: () => require('highlight.js/lib/languages/python'),
  'python-repl': () => require('highlight.js/lib/languages/python-repl'),
  q: () => require('highlight.js/lib/languages/q'),
  qml: () => require('highlight.js/lib/languages/qml'),
  r: () => require('highlight.js/lib/languages/r'),
  reasonml: () => require('highlight.js/lib/languages/reasonml'),
  rib: () => require('highlight.js/lib/languages/rib'),
  roboconf: () => require('highlight.js/lib/languages/roboconf'),
  routeros: () => require('highlight.js/lib/languages/routeros'),
  rsl: () => require('highlight.js/lib/languages/rsl'),
  ruby: () => require('highlight.js/lib/languages/ruby'),
  ruleslanguage: () => require('highlight.js/lib/languages/ruleslanguage'),
  rust: () => require('highlight.js/lib/languages/rust'),
  sas: () => require('highlight.js/lib/languages/sas'),
  scala: () => require('highlight.js/lib/languages/scala'),
  scheme: () => require('highlight.js/lib/languages/scheme'),
  scilab: () => require('highlight.js/lib/languages/scilab'),
  scss: () => require('highlight.js/lib/languages/scss'),
  shell: () => require('highlight.js/lib/languages/shell'),
  smali: () => require('highlight.js/lib/languages/smali'),
  smalltalk: () => require('highlight.js/lib/languages/smalltalk'),
  sml: () => require('highlight.js/lib/languages/sml'),
  sqf: () => require('highlight.js/lib/languages/sqf'),
  sql: () => require('highlight.js/lib/languages/sql'),
  sql_more: () => require('highlight.js/lib/languages/sql_more'),
  stan: () => require('highlight.js/lib/languages/stan'),
  stata: () => require('highlight.js/lib/languages/stata'),
  step21: () => require('highlight.js/lib/languages/step21'),
  stylus: () => require('highlight.js/lib/languages/stylus'),
  subunit: () => require('highlight.js/lib/languages/subunit'),
  swift: () => require('highlight.js/lib/languages/swift'),
  taggerscript: () => require('highlight.js/lib/languages/taggerscript'),
  tap: () => require('highlight.js/lib/languages/tap'),
  tcl: () => require('highlight.js/lib/languages/tcl'),
  thrift: () => require('highlight.js/lib/languages/thrift'),
  tp: () => require('highlight.js/lib/languages/tp'),
  twig: () => require('highlight.js/lib/languages/twig'),
  typescript: () => require('highlight.js/lib/languages/typescript'),
  vala: () => require('highlight.js/lib/languages/vala'),
  vbnet: () => require('highlight.js/lib/languages/vbnet'),
  vbscript: () => require('highlight.js/lib/languages/vbscript'),
  'vbscript-html': () =>
    require('highlight.js/lib/languages/vbscript-html'),
  verilog: () => require('highlight.js/lib/languages/verilog'),
  vhdl: () => require('highlight.js/lib/languages/vhdl'),
  vim: () => require('highlight.js/lib/languages/vim'),
  x86asm: () => require('highlight.js/lib/languages/x86asm'),
  xl: () => require('highlight.js/lib/languages/xl'),
  xml: () => require('highlight.js/lib/languages/xml'),
  xquery: () => require('highlight.js/lib/languages/xquery'),
  yaml: () => require('highlight.js/lib/languages/yaml'),
  zephir: () => require('highlight.js/lib/languages/zephir'),
}
/* eslint-enable @typescript-eslint/no-require-imports */

const languageAliases: Record<string, string> = {
  as: 'actionscript',
  asc: 'angelscript',
  apacheconf: 'apache',
  osascript: 'applescript',
  ino: 'arduino',
  arm: 'armasm',
  adoc: 'asciidoc',
  ahk: 'autohotkey',
  'x++': 'axapta',
  sh: 'bash',
  zsh: 'bash',
  bf: 'brainfuck',
  h: 'c-like',
  cc: 'cpp',
  'c++': 'cpp',
  'h++': 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cxx: 'cpp',
  capnp: 'capnproto',
  icl: 'clean',
  dcl: 'clean',
  clj: 'clojure',
  'cmake.in': 'cmake',
  coffee: 'coffeescript',
  cson: 'coffeescript',
  iced: 'coffeescript',
  cls: 'cos',
  crm: 'crmsh',
  pcmk: 'crmsh',
  cr: 'crystal',
  cs: 'csharp',
  'c#': 'csharp',
  dpr: 'delphi',
  dfm: 'delphi',
  pas: 'delphi',
  pascal: 'delphi',
  freepascal: 'delphi',
  lazarus: 'delphi',
  lpr: 'delphi',
  lfm: 'delphi',
  patch: 'diff',
  jinja: 'django',
  bind: 'dns',
  zone: 'dns',
  docker: 'dockerfile',
  bat: 'dos',
  cmd: 'dos',
  dst: 'dust',
  erl: 'erlang',
  xlsx: 'excel',
  xls: 'excel',
  f90: 'fortran',
  f95: 'fortran',
  fs: 'fsharp',
  gms: 'gams',
  gss: 'gauss',
  nc: 'gcode',
  feature: 'gherkin',
  golang: 'go',
  hbs: 'htmlbars',
  'html.hbs': 'htmlbars',
  'html.handlebars': 'htmlbars',
  hs: 'haskell',
  hx: 'haxe',
  https: 'http',
  hylang: 'hy',
  i7: 'inform7',
  toml: 'ini',
  jsp: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  'wildfly-cli': 'jboss-cli',
  kt: 'kotlin',
  kts: 'kotlin',
  ls: 'livescript',
  lassoscript: 'lasso',
  tex: 'latex',
  mk: 'makefile',
  mak: 'makefile',
  make: 'makefile',
  md: 'markdown',
  mkdown: 'markdown',
  mkd: 'markdown',
  mma: 'mathematica',
  wl: 'mathematica',
  m: 'mercury',
  moo: 'mercury',
  mips: 'mipsasm',
  moon: 'moonscript',
  nginxconf: 'nginx',
  nixos: 'nix',
  mm: 'objectivec',
  objc: 'objectivec',
  'obj-c': 'objectivec',
  'obj-c++': 'objectivec',
  'objective-c++': 'objectivec',
  ml: 'sml',
  scad: 'openscad',
  pl: 'perl',
  pm: 'perl',
  'pf.conf': 'pf',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  php3: 'php',
  php4: 'php',
  php5: 'php',
  php6: 'php',
  php7: 'php',
  php8: 'php',
  text: 'plaintext',
  txt: 'plaintext',
  ps: 'powershell',
  ps1: 'powershell',
  pp: 'puppet',
  pb: 'purebasic',
  pbi: 'purebasic',
  py: 'python',
  gyp: 'python',
  ipython: 'python',
  pycon: 'python-repl',
  k: 'q',
  kdb: 'q',
  qt: 'qml',
  re: 'reasonml',
  graph: 'roboconf',
  instances: 'roboconf',
  mikrotik: 'routeros',
  rb: 'ruby',
  gemspec: 'ruby',
  podspec: 'ruby',
  thor: 'ruby',
  irb: 'ruby',
  rs: 'rust',
  sci: 'scilab',
  console: 'shell',
  st: 'smalltalk',
  mysql: 'sql_more',
  oracle: 'sql_more',
  stanfuncs: 'stan',
  do: 'stata',
  ado: 'stata',
  p21: 'step21',
  step: 'step21',
  stp: 'step21',
  styl: 'stylus',
  tk: 'tcl',
  craftcms: 'twig',
  ts: 'typescript',
  tsx: 'typescript',
  vb: 'vbnet',
  vbs: 'vbscript',
  v: 'verilog',
  sv: 'verilog',
  svh: 'verilog',
  tao: 'xl',
  html: 'xml',
  xhtml: 'xml',
  rss: 'xml',
  atom: 'xml',
  xjb: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  plist: 'xml',
  wsf: 'xml',
  svg: 'xml',
  xpath: 'xquery',
  xq: 'xquery',
  yml: 'yaml',
  zep: 'zephir',
}

const languageDependencies: Record<string, string[]> = {
  asciidoc: ['xml'],
  'clojure-repl': ['clojure'],
  coffeescript: ['javascript'],
  cos: ['javascript', 'sql', 'xml'],
  dart: ['markdown'],
  django: ['xml'],
  dockerfile: ['bash'],
  dust: ['xml'],
  erb: ['ruby', 'xml'],
  haml: ['ruby'],
  handlebars: ['xml'],
  htmlbars: ['xml'],
  javascript: ['css', 'xml'],
  'julia-repl': ['julia'],
  livescript: ['javascript'],
  markdown: ['xml'],
  mojolicious: ['perl', 'xml'],
  'node-repl': ['javascript'],
  parser3: ['xml'],
  perl: ['mojolicious'],
  pgsql: [
    'bash',
    'java',
    'json',
    'lua',
    'perl',
    'php',
    'python',
    'r',
    'ruby',
    'scheme',
    'tcl',
    'xml',
  ],
  'php-template': ['php', 'xml'],
  'python-repl': ['python'],
  qml: ['xml'],
  shell: ['bash'],
  tap: ['yaml'],
  twig: ['xml'],
  typescript: ['css', 'xml'],
  'vbscript-html': ['vbscript', 'xml'],
  xml: ['css', 'handlebars', 'javascript'],
  xquery: ['xml'],
  yaml: ['ruby'],
}

const loadedLanguages = new Set<string>()
const failedLanguages = new Set<string>()
let cachedHljsCore: HLJSApi | null = null

export function getHljsCore(): HLJSApi {
  if (cachedHljsCore) return cachedHljsCore

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('highlight.js/lib/core') as
    | HLJSApi
    | { default?: HLJSApi }
  const hljs =
    'default' in module && module.default
      ? module.default
      : (module as HLJSApi)

  registerExtraLanguages(hljs)
  cachedHljsCore = hljs
  return hljs
}

function unwrapLanguage(module: LanguageModule): LanguageFn {
  if ('default' in module && module.default) return module.default
  return module as LanguageFn
}

/**
 * Registers a grammar and its sublanguage dependencies on first use.
 * Returns the canonical language name, or null when no grammar is available.
 */
export function ensureLanguage(language: string): string | null {
  const hljs = getHljsCore()
  const normalized = language.toLowerCase()
  const canonical = Object.prototype.hasOwnProperty.call(
    languageLoaders,
    normalized,
  )
    ? normalized
    : Object.prototype.hasOwnProperty.call(languageAliases, normalized)
      ? languageAliases[normalized]!
      : null

  if (canonical !== null) {
    if (failedLanguages.has(canonical)) return null

    if (!loadedLanguages.has(canonical)) {
      const loader = languageLoaders[canonical]
      if (typeof loader !== 'function') return null

      try {
        hljs.registerLanguage(canonical, unwrapLanguage(loader()))
      } catch (error) {
        failedLanguages.add(canonical)
        logError(error)
        return null
      }

      // Mark before loading dependencies because several grammars are cyclic
      // (notably javascript <-> xml).
      loadedLanguages.add(canonical)
      for (const dependency of languageDependencies[canonical] ?? []) {
        ensureLanguage(dependency)
      }
    }

    return canonical
  }

  // Extra grammars (currently Cedar) are registered when the core is created.
  return hljs.getLanguage(normalized) ? normalized : null
}
