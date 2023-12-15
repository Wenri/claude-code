import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { verifyTarget } from '../scripts/verify-case.mjs'

function fixture(targetDeclarations) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'verify-declaration-edits-'),
  )
  const values = {
    baselineDeclarations:
      'export type Stable = string\n' +
      'export interface EditResult {\n' +
      '  originalFile: string;\n' +
      '}\n',
    targetDeclarations,
    baselinePackageJson: '{"version": "2.1.96"}\n',
    targetPackageJson: '{"version": "2.1.97"}\n',
    targetBundle: '',
  }
  const files = {}
  for (const [name, value] of Object.entries(values)) {
    files[name] = path.join(temporary, name)
    fs.writeFileSync(files[name], value)
  }
  const manifest = {
    targetAssertions: {
      declarationExactEdits: [
        {
          anchor: 'export type Stable = string\n',
          text: 'export type ToolStats = { readCount: number }\n',
        },
        {
          from: '  originalFile: string;\n',
          to: '  originalFile: string | null;\n',
        },
      ],
      packageVersionChange: {
        baseline: '2.1.96',
        target: '2.1.97',
      },
      bundleFragments: [],
    },
  }
  return { files, manifest, temporary }
}

test('verifies the exact target produced by ordered declaration edits', () => {
  const value = fixture(
    'export type Stable = string\n' +
      'export type ToolStats = { readCount: number }\n' +
      'export interface EditResult {\n' +
      '  originalFile: string | null;\n' +
      '}\n',
  )
  try {
    const result = verifyTarget(value.manifest, value.files)
    assert.equal(result.declarationsChange, '2 exact ordered edits')
  } finally {
    fs.rmSync(value.temporary, { recursive: true, force: true })
  }
})

test('rejects a declaration target that only partially applies the edits', () => {
  const value = fixture(
    'export type Stable = string\n' +
      'export type ToolStats = { readCount: number }\n' +
      'export interface EditResult {\n' +
      '  originalFile: string;\n' +
      '}\n',
  )
  try {
    assert.throws(
      () => verifyTarget(value.manifest, value.files),
      /target declarations exact ordered edits/,
    )
  } finally {
    fs.rmSync(value.temporary, { recursive: true, force: true })
  }
})

test('rejects conflicting declaration assertion modes', () => {
  const value = fixture('')
  value.manifest.targetAssertions.declarationChange = {
    kind: 'unchanged',
  }
  try {
    assert.throws(
      () => verifyTarget(value.manifest, value.files),
      /must describe exactly one declaration mode/,
    )
  } finally {
    fs.rmSync(value.temporary, { recursive: true, force: true })
  }
})
