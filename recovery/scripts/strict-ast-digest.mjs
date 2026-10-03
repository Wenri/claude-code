#!/usr/bin/env node
import fs from 'node:fs'
import { strictAstDigest } from '../lib/strict-ast.mjs'
const [filename, offset = '0', length] = process.argv.slice(2)
if (!filename) throw new Error('Usage: strict-ast-digest.mjs FILE [BYTE_OFFSET BYTE_LENGTH]')
const bytes = fs.readFileSync(filename)
const start = Number(offset)
const end = length === undefined ? bytes.length : start + Number(length)
if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > bytes.length || end < start) throw new Error('Invalid AST input slice')
console.log(JSON.stringify(strictAstDigest(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end)))))
