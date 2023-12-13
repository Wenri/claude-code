import test from 'node:test'
import {
  assertAuthenticatedFragments,
  assertRetainedSourceFragments,
  assertSourceFragments,
  assertSourceRemoval,
  assertTargetRemoval,
} from './recovery-2.1.118-test-helpers.mjs'

const FRAGMENTS = [
  [
    'custom-theme picker sentinel',
    '__new_custom_theme__',
    0,
    1,
    'aef083f278047ab70b98daedf95ad856e03723515a190246ba0c994c517c5e54',
  ],
  [
    'custom-theme editor surface',
    'New custom theme',
    0,
    2,
    '065207e0e6af9dd09d1817293ab0f8c63e9ede810e360a7474359d49a21f20c1',
  ],
  [
    'fuzzy picker multi-select contract',
    'onSelectMany',
    0,
    1,
    'ef86548e91f9faef3b5189fffe9446e634c8d5b0efdda5c8ac46f607d719fcb2',
  ],
  [
    'fuzzy picker cancel action',
    'cancelAction',
    0,
    2,
    '44af4c67781da8f90611b631d8da481561fb7ec1482eb8245e3f221768d5cf8a',
  ],
  [
    'readable status pill foreground',
    'color:O,textColor:"text",padded:!0},M," ","(",f,") "',
    0,
    1,
    '989b389b0aba3bb78235c842a911ef45112a5557b087230c32b2e04e4cbd7361',
  ],
  [
    'readable plugin badge foreground',
    'color:"userMessageBackground",textColor:"text"},"Plugin"',
    0,
    3,
    '6436497ad089e35723fb5bda26d101158df2f1f46c9b686d02036864c3109cc0',
  ],
  [
    'plugin autoupdate pinner errors',
    'autoupdate-blocked-by-pinner',
    0,
    5,
    'b9db5eb5bc49fe25c623210c69a7a4f2b6b493d038dd8781f78c183b8f0cc30b',
  ],
  [
    'frontmatter unknown-key shadow telemetry',
    'tengu_frontmatter_shadow_unknown_key',
    0,
    1,
    'a2b670de41da6a429fc7ce84e1e90b03c50d583275e3283097c8f8e4a7fbc234',
  ],
  [
    'frontmatter mismatch shadow telemetry',
    'tengu_frontmatter_shadow_mismatch',
    0,
    1,
    '39d9c9e79f29f3842ddc30b75ccbc21a17524c27489a120bc788b153da4f1fe1',
  ],
  [
    'plugin tag CLI help',
    '/plugin tag [path] [--push] [--dry-run] [-f]',
    0,
    1,
    '2ce9b01c64bba9e34dbc5aab5eda0190e13a3aea98701b914e6f5eba83a390b3',
  ],
  [
    'pip source schema removal',
    'Python package as plugin source',
    1,
    0,
    '381bfd31ed931927bf8640390e4bc9f8d546cb99aaa8d190011f9b58ed41b041',
  ],
  [
    'unsupported MCP transport details',
    'No details view for ',
    0,
    1,
    '29c3b190fa877815cd328cd5726d72f55e84bf1318dadb242efeef8986449730',
  ],
  [
    'Config tool runtime removal',
    'Get or set Claude Code configuration settings.',
    2,
    0,
    '7869fd2027aa4eecf33514ed6fbb9c6355291e3b7a3d7d6c10a889168afe4795',
  ],
]

test('plugin and theme fragments are authenticated', () => {
  assertAuthenticatedFragments(FRAGMENTS)
})

test('recovers custom-theme loading, editing, preview, and plugin discovery', () => {
  assertSourceFragments('src/utils/customThemes.ts', [
    'MAX_THEME_FILE_SIZE = 262_144',
    '[theme] ${slug}.json: invalid JSON',
    '[theme] ${filePath} exceeds 256KB; skipping',
    'export async function saveCustomTheme',
    '{ name: theme.name, base: theme.base, overrides: theme.overrides }',
    'await writeFile(',
  ])
  assertSourceFragments('src/components/ThemePicker.tsx', [
    "value: '__new_custom_theme__'",
    'New custom theme…',
    'theme:editCustom',
    'onCustomTheme',
  ])
  assertSourceFragments('src/components/CustomThemeEditor.tsx', [
    'Filter color tokens…',
    'cancelAction="done"',
    'setPreviewOverrides',
    'saveCustomTheme',
    'ansi256(n), or ansi:name',
  ])
  assertSourceFragments('src/components/design-system/FuzzyPicker.tsx', [
    'cancelAction?: string',
    'onSelectMany',
    'onWheel={handleWheel}',
    'marked.size',
  ])
  assertSourceFragments('src/components/design-system/Label.tsx', [
    "textColor?: TextProps['color']",
    "const foreground = textColor ?? (color ? 'inverseText' : undefined)",
    'color={foreground}',
  ])
  assertSourceFragments('src/commands/plugin/UnifiedInstalledCell.tsx', [
    '<Label color="userMessageBackground" textColor="text">Plugin</Label>',
  ])
  assertSourceFragments('src/utils/plugins/loadPluginThemes.ts', [
    'themesPath',
    'themesPaths',
    'const source = { plugin: plugin.name }',
  ])
  assertSourceFragments('src/utils/plugins/schemas.ts', [
    'themes:',
    'Path to additional themes directory or file',
  ])
})

test('recovers plugin pinner, dependency reinstall, and source validation', () => {
  assertSourceFragments('src/utils/plugins/pluginAutoupdate.ts', [
    "type: 'autoupdate-blocked-by-pinner'",
    'disabledPinners',
    'blockedBy',
  ])
  assertSourceFragments('src/hooks/notifs/usePluginAutoupdateNotification.tsx', [
    'blocked by pinner',
    "error.type !== 'autoupdate-blocked-by-pinner'",
  ])
  assertSourceFragments('src/services/plugins/pluginOperations.ts', [
    "error.type !== 'dependency-unsatisfied'",
    "error.reason !== 'not-found'",
  ])
  assertTargetRemoval(
    'src/utils/plugins/schemas.ts',
    'Python package as plugin source',
  )
  assertTargetRemoval(
    'src/utils/plugins/pluginLoader.ts',
    'Python package plugins are not yet supported',
  )
})

test('recovers shadow validation, plugin-tag reachability, and Config removal', () => {
  assertSourceFragments('src/utils/frontmatterShadowValidation.ts', [
    'shadowValidateFrontmatter',
    '.strict()',
    'tengu_frontmatter_shadow_unknown_key',
    'tengu_frontmatter_shadow_mismatch',
  ])
  assertSourceFragments('src/tools/AgentTool/loadAgentsDir.ts', [
    "shadowValidateFrontmatter('agent'",
  ])
  assertSourceFragments('src/skills/loadSkillsDir.ts', [
    "shadowValidateFrontmatter('skill'",
  ])
  assertSourceFragments('src/outputStyles/loadOutputStylesDir.ts', [
    "shadowValidateFrontmatter('output-style'",
  ])
  assertSourceFragments('src/utils/plugins/validatePlugin.ts', [
    'validatePluginRelease',
    'executePluginTag',
    'Version mismatch:',
    'already exists locally',
  ])
  assertSourceFragments('src/cli/handlers/plugins.ts', [
    'pluginTagHandler',
    'dryRun?: boolean',
    'remote',
  ])
  assertSourceFragments('src/main.tsx', [
    ".command('tag [path]')",
    "--message <msg>",
    "--remote <name>",
  ])
  assertRetainedSourceFragments('src/tools/ConfigTool/prompt.ts', [
    'Get or set Claude Code configuration settings.',
  ])
  assertSourceRemoval('src/tools.ts', 'ConfigTool')
})
