import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractBaseline } from '../scripts/extract-baseline.mjs'

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extract-baseline-test-'))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function inlineTsx(outer, original, nestedSource = 'View.tsx') {
  const generatedLines = outer.endsWith('\n')
    ? outer.slice(0, -1).split('\n').length
    : outer.split('\n').length
  const nested = {
    version: 3,
    sources: [nestedSource],
    sourcesContent: [original],
    names: [],
    mappings: Array.from(
      { length: generatedLines },
      (_, index) => (index === 0 ? 'AAAA' : ''),
    ).join(';'),
  }
  return (
    outer +
    '//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
    Buffer.from(JSON.stringify(nested)).toString('base64')
  )
}

function writeMap(directory, sources, contents) {
  const filename = path.join(directory, 'baseline.map')
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 3,
      sources,
      sourcesContent: contents,
      names: [],
      mappings: 'AAAA',
    }),
  )
  return filename
}

test('extracts compiler inputs and pristine TSX originals with a manifest', () => {
  const directory = temporaryDirectory()
  try {
    const plain = 'export const value = 1\n'
    const originalTsx =
      'export function View() {\n  return <div>original</div>\n}\n'
    const compiledTsx = inlineTsx(
      'export function View() {\n  return jsx("div", {});\n}\n',
      originalTsx,
    )
    const dependency = 'module.exports = 42\n'
    const vendor = 'export const native = true\n'
    const map = writeMap(
      directory,
      [
        '../src/plain.ts',
        '../src/View.tsx',
        '../node_modules/pkg/index.js',
        '../vendor/native/index.ts',
      ],
      [plain, compiledTsx, dependency, vendor],
    )
    const output = path.join(directory, 'output')
    const manifest = extractBaseline({ mapPath: map, outputPath: output })

    assert.equal(
      fs.readFileSync(path.join(output, 'bun-input/src/plain.ts'), 'utf8'),
      plain,
    )
    assert.equal(
      fs.readFileSync(path.join(output, 'bun-input/src/View.tsx'), 'utf8'),
      compiledTsx,
    )
    assert.equal(
      fs.readFileSync(
        path.join(output, 'bun-input/node_modules/pkg/index.js'),
        'utf8',
      ),
      dependency,
    )
    assert.equal(
      fs.readFileSync(
        path.join(output, 'bun-input/vendor/native/index.ts'),
        'utf8',
      ),
      vendor,
    )
    assert.equal(
      fs.readFileSync(path.join(output, 'pristine/src/plain.ts'), 'utf8'),
      plain,
    )
    assert.equal(
      fs.readFileSync(path.join(output, 'pristine/src/View.tsx'), 'utf8'),
      originalTsx,
    )
    assert.equal(
      fs.existsSync(path.join(output, 'pristine/node_modules')),
      false,
    )

    assert.equal(manifest.counts.outerSourceCount, 4)
    assert.equal(manifest.counts.pristineSourceCount, 2)
    assert.equal(manifest.counts.nestedTsxSourceCount, 1)
    assert.equal(manifest.trees.bunInput.categories.src.count, 2)
    assert.equal(manifest.trees.bunInput.categories.node_modules.count, 1)
    assert.equal(manifest.trees.bunInput.categories.vendor.count, 1)
    assert.equal(manifest.sourceMap.sha256, sha256(fs.readFileSync(map)))
    assert.equal(
      manifest.files.find(file => file.source === '../src/View.tsx')
        .pristine.origin,
      'nested-inline-source-map',
    )
    for (const file of manifest.files) {
      for (const extracted of [file.bunInput, file.pristine]) {
        if (!extracted) continue
        const value = fs.readFileSync(path.join(output, extracted.path))
        assert.equal(value.length, extracted.bytes, extracted.path)
        assert.equal(sha256(value), extracted.sha256, extracted.path)
      }
    }
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')),
      manifest,
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('rejects unsafe outer and nested paths without partial extraction', () => {
  const directory = temporaryDirectory()
  try {
    const cases = [
      {
        source: '/absolute.ts',
        content: 'export {}\n',
      },
      {
        source: '../src/../../escape.ts',
        content: 'export {}\n',
      },
      {
        source: 'C:\\escape.ts',
        content: 'export {}\n',
      },
      {
        source: '../src/View.tsx',
        content: inlineTsx(
          'export const View = () => null;\n',
          'export const View = () => null\n',
          '../View.tsx',
        ),
      },
    ]

    for (let index = 0; index < cases.length; index += 1) {
      const item = cases[index]
      const map = writeMap(
        directory,
        [item.source],
        [item.content],
      )
      const output = path.join(directory, `unsafe-${index}`)
      assert.throws(
        () => extractBaseline({ mapPath: map, outputPath: output }),
        /Unsafe source-map path/,
      )
      assert.equal(fs.existsSync(output), false)
    }
    assert.equal(fs.existsSync(path.join(directory, 'escape.ts')), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('refuses a non-empty output directory without changing it', () => {
  const directory = temporaryDirectory()
  try {
    const map = writeMap(
      directory,
      ['../src/plain.ts'],
      ['export const value = 1\n'],
    )
    const output = path.join(directory, 'output')
    fs.mkdirSync(output)
    const sentinel = path.join(output, 'keep-me')
    fs.writeFileSync(sentinel, 'preserve')

    assert.throws(
      () => extractBaseline({ mapPath: map, outputPath: output }),
      /Refusing to use non-empty output directory/,
    )
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve')
    assert.deepEqual(fs.readdirSync(output), ['keep-me'])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
