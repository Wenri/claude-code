import fs from 'node:fs'

const pattern = new RegExp(process.argv[2])
const lines = fs.readFileSync(0, 'utf8').split('\n')
const header = []
let index = 0
while (index < lines.length && !lines[index].startsWith('@@ ')) {
  header.push(lines[index++])
}
const hunks = []
while (index < lines.length) {
  if (!lines[index].startsWith('@@ ')) {
    index++
    continue
  }
  const hunk = [lines[index++]]
  while (index < lines.length && !lines[index].startsWith('@@ ')) {
    hunk.push(lines[index++])
  }
  const text = hunk.join('\n')
  if (pattern.test(text)) hunks.push(text)
}
if (hunks.length) process.stdout.write(`${header.join('\n')}\n${hunks.join('\n')}\n`)
