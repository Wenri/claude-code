import fs from 'node:fs'
import { minify } from 'terser'

const [filename, startText, endText] = process.argv.slice(2)
const source = fs.readFileSync(filename, 'utf8').slice(Number(startText), Number(endText))
const result = await minify(source, {
  compress: false,
  mangle: false,
  format: { beautify: true, comments: false },
})
process.stdout.write(`${result.code}\n`)
