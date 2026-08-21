import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const treeRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const bundle = fs.readFileSync('.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js', 'utf8')
const analysis = JSON.parse(fs.readFileSync('recovery/test/recovery-2.1.118-owner-residue-analysis.json'))
const structural = JSON.parse(gunzipSync(fs.readFileSync('recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz')))
const regions = new Map(structural.regions.map(row => [row.target.index, row]))
const imported = await import(pathToFileURL(path.join(root, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js')).href)
const ts = imported.default ?? imported

function id(kind, value) { return `${kind}:${JSON.stringify(value)}` }
function walkAcorn(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) walkAcorn(child, visit); return }
  if (node.type) visit(node)
  for (const [key, child] of Object.entries(node)) if (!['start','end','loc','range','raw','type'].includes(key)) walkAcorn(child, visit)
}
function bundleIds(text) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' })
  const values = new Set()
  walkAcorn(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) values.add(id('regexp', {pattern:node.regex.pattern,flags:[...node.regex.flags].sort().join('')}))
      else if (typeof node.value === 'string') values.add(id('string', node.value))
      else if (typeof node.value === 'number') values.add(id('number', String(node.value)))
    } else if (node.type === 'TemplateElement') {
      values.add(id('string', node.value.cooked ?? node.value.raw))
    }
    const prop = ['Property','MethodDefinition','PropertyDefinition'].includes(node.type) && !node.computed && node.key?.type === 'Identifier' ? node.key : node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier' ? node.property : null
    if (prop) values.add(id('property', prop.name))
  })
  return values
}
function parseRegex(text) {
  if (!text.startsWith('/')) return null
  let esc=false, cls=false
  for(let i=1;i<text.length;i++){const c=text[i];if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c==='['){cls=true;continue}if(c===']'){cls=false;continue}if(c==='/'&&!cls)return{pattern:text.slice(1,i),flags:[...text.slice(i+1)].sort().join('')}}
  return null
}
function sourceIds(node, sourceFile) {
  const values = new Set()
  function visit(child) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateLiteralToken(child)) values.add(id('string', child.text))
    else if (ts.isJsxText(child)) values.add(id('string', child.getText(sourceFile)))
    else if (ts.isNumericLiteral(child)) values.add(id('number', String(Number(child.text.replaceAll('_','')))))
    else if (ts.isRegularExpressionLiteral(child)) { const x=parseRegex(child.getText(sourceFile)); if(x) values.add(id('regexp',x)) }
    const property = ((ts.isPropertyAssignment(child)||ts.isShorthandPropertyAssignment(child)||ts.isMethodDeclaration(child)||ts.isGetAccessorDeclaration(child)||ts.isSetAccessorDeclaration(child)||ts.isPropertyDeclaration(child)||ts.isPropertySignature(child)||ts.isMethodSignature(child)||ts.isBindingElement(child)||ts.isJsxAttribute(child))&&child.name&&ts.isIdentifier(child.name))?child.name.text:ts.isPropertyAccessExpression(child)&&ts.isIdentifier(child.name)?child.name.text:null
    if(property) values.add(id('property',property))
    ts.forEachChild(child,visit)
  }
  visit(node)
  return values
}
function files(dir) {
  const out=[]; const pending=[dir]
  while(pending.length){const d=pending.pop();for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())pending.push(f);else if(e.isFile()&&/\.[cm]?[jt]sx?$/.test(f))out.push(f)}}
  return out.sort()
}
function declarationName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return null
}
function declarationLike(node) {
  return ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)||ts.isVariableDeclaration(node)||ts.isMethodDeclaration(node)||ts.isPropertyAssignment(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)
}
const inventory=[]
const scopes=[]
for (const filename of files(treeRoot)) {
  const source=fs.readFileSync(filename,'utf8')
  const sf=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  const relative=path.relative(treeRoot,filename)
  const fileIds=sourceIds(sf,sf)
  inventory.push({path:relative, ids:fileIds})
  function visit(node){
    const name=declarationName(node)
    if(declarationLike(node)&&name){
      scopes.push({path:relative,kind:ts.SyntaxKind[node.kind],name,start:node.getStart(sf),end:node.end,ids:sourceIds(node,sf)})
    }
    ts.forEachChild(node,visit)
  }
  visit(sf)
}
const documentFrequency=new Map()
for(const file of inventory)for(const value of file.ids)documentFrequency.set(value,(documentFrequency.get(value)??0)+1)
function weight(value){const df=documentFrequency.get(value)??inventory.length;const rarity=Math.log2(1+inventory.length/df);return rarity*(value.startsWith('property:')?1:value.startsWith('number:')?0.5:2)}
for (const mapping of analysis.analysis.sourceGapReplay.transitiveExactConsensus.mappings) {
  const region=regions.get(mapping.targetIndex)
  const ids=bundleIds(bundle.slice(region.target.start,region.target.end))
  const scored=inventory.map(file=>{const common=[...ids].filter(x=>file.ids.has(x));const stable=common.filter(x=>!x.startsWith('property:') || !['property:"then"','property:"resolve"','property:"path"','property:"createElement"'].includes(x));return{path:file.path,common:common.length,stable:stable.length,examples:stable.filter(x=>x.startsWith('string:')||x.startsWith('regexp:')).slice(0,8)}}).filter(x=>x.common).sort((a,b)=>b.stable-a.stable||b.common-a.common||a.path.localeCompare(b.path)).slice(0,8)
  const declarationScores=scopes.map(scope=>{const common=[...ids].filter(x=>scope.ids.has(x));return{path:scope.path,kind:scope.kind,name:scope.name,start:scope.start,end:scope.end,common:common.length,score:Number(common.reduce((n,x)=>n+weight(x),0).toFixed(3)),examples:common.filter(x=>!x.startsWith('property:')).slice(0,8)}}).filter(x=>x.common).sort((a,b)=>b.score-a.score||b.common-a.common||(a.end-a.start)-(b.end-b.start)||a.path.localeCompare(b.path)).slice(0,12)
  console.log(JSON.stringify({targetIndex:mapping.targetIndex,replay:mapping.replaySourcePath,targetIds:ids.size,scored,declarationScores}))
}
