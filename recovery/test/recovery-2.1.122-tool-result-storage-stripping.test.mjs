import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained tool-result storage stripping', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('stripForStorage').length - 1,
      6,
      `${version}: three reducers and three helper references`,
    )
    assert.match(
      bundle,
      /stripForStorage\(([\w$]+)\)\{if\(typeof \1!=="object"\|\|\1===null\)return \1;if\(\1\.type!=="update"\)return \1;if\(\1\.content===""&&\(\1\.originalFile\?\?""\)===""\)return \1;return\{\.\.\.\1,content:"",originalFile:null\}\}/,
      `${version}: FileWrite strips update content and original file`,
    )
    assert.match(
      bundle,
      /stripForStorage\(([\w$]+)\)\{if\(typeof \1!=="object"\|\|\1===null\)return \1;if\(\(\1\.originalFile\?\?""\)===""\)return \1;return\{\.\.\.\1,originalFile:""\}\}/,
      `${version}: FileEdit strips original file`,
    )
    assert.match(
      bundle,
      /stripForStorage\(([\w$]+)\)\{if\(typeof \1!=="object"\|\|\1===null\)return \1;switch\(\1\.type\)\{case"text":[\s\S]{0,800}?case"image":[\s\S]{0,500}?case"pdf":[\s\S]{0,500}?case"notebook":[\s\S]{0,500}?cells:Array\([\w$]+\.length\)[\s\S]{0,100}?default:return \1\}\}/,
      `${version}: FileRead strips text, image, PDF, and notebook payloads`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+),([\w$]+)=200\)\{let ([\w$]+)=\1\.length-\3;if\(\4<=0\)return \1;let [\w$]+=new Map,[\w$]+;for\(let [\w$]+=0;[\s\S]{0,1400}?\.stripForStorage\([\w$]+\.toolUseResult\)[\s\S]{0,350}?return [\w$]+\?\?\1\}/,
      `${version}: only results older than the retained 200-message tail are stripped`,
    )
    assert.match(
      bundle,
      /[\w$]+\(\{type:"update",updater:\(([\w$]+)\)=>[\w$]+\(\1,([\w$]+)\.options\.tools\)\}\),[\w$]+\("query_end"\)/,
      `${version}: REPL applies stripping after each completed query`,
    )
  }
})

test('source restores reducers, aging helper, and live REPL callsite', () => {
  const root = new URL('../../', import.meta.url)
  const toolType = readFileSync(new URL('src/Tool.ts', root), 'utf8')
  const writeTool = readFileSync(
    new URL('src/tools/FileWriteTool/FileWriteTool.ts', root),
    'utf8',
  )
  const readTool = readFileSync(
    new URL('src/tools/FileReadTool/FileReadTool.ts', root),
    'utf8',
  )
  const editTool = readFileSync(
    new URL('src/tools/FileEditTool/FileEditTool.ts', root),
    'utf8',
  )
  const messages = readFileSync(new URL('src/utils/messages.ts', root), 'utf8')
  const repl = readFileSync(new URL('src/screens/REPL.tsx', root), 'utf8')

  assert.ok(toolType.includes('stripForStorage?(output: Output): Output'))
  assert.match(
    writeTool,
    /stripForStorage\(output\)[\s\S]*?output\.type !== 'update'[\s\S]*?content: '', originalFile: null/,
  )
  assert.match(
    editTool,
    /stripForStorage\(output\)[\s\S]*?originalFile \?\? ''[\s\S]*?originalFile: ''/,
  )
  for (const type of ['text', 'image', 'pdf', 'notebook']) {
    assert.ok(readTool.includes(`case '${type}':`), `FileRead ${type} reducer`)
  }
  assert.ok(messages.includes('export function stripOldToolResultsForStorage('))
  assert.ok(messages.includes('retainLast = 200'))
  assert.ok(messages.includes('if (!updatedMessages) updatedMessages = messages.slice()'))
  assert.ok(
    repl.includes(
      'setMessages(previous => stripOldToolResultsForStorage(previous, freshTools));',
    ),
  )
})
