import crypto from 'node:crypto';
import { parse } from '../v12/validation/node_modules/acorn/dist/acorn.mjs';
import { orderedUniqueAlignment } from '../../claude-per-version-upstream/recovery/lib/ordered-ast-alignment.mjs';

export const VERSION = 'whole-program-statement-diagnostics-v2-restored';
export const LIMITS = Object.freeze({ maxSourceBytes: 32 * 1024 * 1024, maxNodes: 4_000_000, maxOutputBytes: 64 * 1024 * 1024 });
const positions = new Set(['start', 'end', 'loc', 'range']);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function limit(value, ceiling, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error(`invalid ${label}`);
  return value;
}
function children(value, visit, parent = null, field = null) {
  if (value === null || typeof value !== 'object' || value instanceof RegExp) return;
  if (Array.isArray(value)) { for (const item of value) children(item, visit, parent, field); return; }
  if (typeof value.type === 'string') visit(value, parent, field);
  for (const key of Object.keys(value)) if (!positions.has(key)) children(value[key], visit, value, key);
}
function runtimeName(node, parent, field) {
  if (node.type !== 'Identifier' || !parent) return false;
  if (parent.type === 'MemberExpression' && field === 'property' && !parent.computed) return true;
  if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type) && field === 'key' && !parent.computed) return true;
  if (parent.type === 'ImportSpecifier' && field === 'imported') return true;
  if (['ExportSpecifier', 'ExportAllDeclaration'].includes(parent.type) && field === 'exported') return true;
  if (parent.type === 'ImportAttribute' && field === 'key') return true;
  if (parent.type === 'MetaProperty') return true;
  if (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type) && field === 'label') return true;
  return false;
}
const token = node => `${node.start}:${node.end}`;
// Same serialization as strict-ast.mjs. The caller supplies validated AST nodes;
// no statement is reparsed, and directive/export context remains intact.
function digest(value, protectedTokens, maxNodes, shape = false) {
  const hash = crypto.createHash('sha256');
  let nodes = 0, erased = 0, protectedIdentifiers = 0;
  function visit(value, parent = null, field = null) {
    if (value === null) { hash.update('null;'); return; }
    if (Array.isArray(value)) {
      hash.update('['); for (const child of value) visit(child, parent, field); hash.update(']');
    } else if (value instanceof RegExp) {
      visit({ pattern: value.source, flags: value.flags });
    } else if (typeof value === 'object') {
      if (typeof value.type === 'string' && ++nodes > maxNodes) throw new Error('node budget exceeded');
      const identifier = shape && value.type === 'Identifier';
      const protect = identifier && (runtimeName(value, parent, field) || protectedTokens.has(token(value)));
      if (identifier) { if (protect) protectedIdentifiers++; else erased++; }
      hash.update('{');
      for (const key of Object.keys(value).sort()) {
        if (positions.has(key) || (key === 'raw' && value.type === 'Literal')) continue;
        hash.update(JSON.stringify(key) + ':');
        visit(identifier && key === 'name' && !protect ? '@diagnostic-identifier' : value[key], value, key);
      }
      hash.update('}');
    } else {
      const text = typeof value === 'bigint' ? value.toString() : typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value);
      hash.update(`${typeof value}:${text};`);
    }
  }
  visit(value);
  return { nodes, sha256: hash.digest('hex'), identifierNamesErased: erased, protectedIdentifierOccurrences: protectedIdentifiers };
}
export function inspectSource(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (!options || Object.keys(options).some(key => !['maxSourceBytes', 'maxNodes'].includes(key))) throw new Error('unknown inspector option');
  if (Buffer.from(source).toString('utf8') !== source) throw new Error('source must round-trip as UTF-8');
  const maxSourceBytes = limit(options.maxSourceBytes ?? LIMITS.maxSourceBytes, LIMITS.maxSourceBytes, 'source byte budget');
  const maxNodes = limit(options.maxNodes ?? LIMITS.maxNodes, 8_000_000, 'node budget');
  const bytes = Buffer.byteLength(source);
  if (bytes > maxSourceBytes) throw new Error('source byte budget exceeded');
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true });
  // A node budget is checked on the first post-parse traversal. The byte bound
  // constrains parser input; this is not a pre-allocation memory guarantee.
  const protectedTokens = new Set();
  let counted = 0;
  children(ast, (node, parent, field) => {
    if (++counted > maxNodes) throw new Error('node budget exceeded');
    if (runtimeName(node, parent, field)) protectedTokens.add(token(node));
  });
  const strict = digest(ast, protectedTokens, maxNodes);
  const shape = digest(ast, protectedTokens, maxNodes, true);
  const statements = ast.body.map((node, index) => {
    const wrapper = { ...ast, body: [node] };
    const exact = digest(wrapper, protectedTokens, maxNodes);
    const diagnostic = digest(wrapper, protectedTokens, maxNodes, true);
    return { index, type: node.type, range: [node.start, node.end], nodes: exact.nodes - 1,
      strictSha256: exact.sha256, shapeSha256: diagnostic.sha256,
      identifierNamesErased: diagnostic.identifierNamesErased,
      protectedIdentifierOccurrences: diagnostic.protectedIdentifierOccurrences };
  });
  if (statements.reduce((sum, row) => sum + row.nodes, 1) !== strict.nodes) throw new Error('statement node accounting mismatch');
  return { version: VERSION, source: { bytes, utf16Length: source.length, sha256: sha(source) },
    parser: { name: 'acorn', version: '8.15.0', ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, wholeProgramParses: 1 },
    budget: { maxSourceBytes, maxNodes },
    strictAst: { criterion: 'strict-whole-program-ast-v2', parser: 'acorn@8.15.0', ecmaVersion: 2026, nodes: strict.nodes, sha256: strict.sha256 },
    diagnosticShape: { sha256: shape.sha256, identifierNamesErased: shape.identifierNamesErased, protectedIdentifierOccurrences: shape.protectedIdentifierOccurrences },
    statements, limitations: [
      'Shape equality is only a search aid. It erases free and crossing Identifier names without proving binding correspondence, runtime semantics or reorderability.',
      'Runtime property/import/export/label/meta names, shared physical identifier tokens, PrivateIdentifier and template raw values remain significant.',
      'Statement digests wrap original validated nodes in a Program; a detached reparse can differ or fail for exports and directive context.',
      'No application input is executed. Full exact Program acceptance and binding/initializer analysis remain separate.' ] };
}
export function alignInventories(left, right, key = 'shapeSha256') {
  if (!['shapeSha256', 'strictSha256'].includes(key)) throw new Error('invalid diagnostic key');
  for (const inventory of [left, right]) {
    if (inventory?.version !== VERSION || !Array.isArray(inventory.statements)) throw new Error('unsupported inventory');
    inventory.statements.forEach((row, i) => { if (row.index !== i || !/^[a-f0-9]{64}$/.test(row[key])) throw new Error('invalid statement digest'); });
  }
  return { version: VERSION, diagnosticOnly: true, semanticAcceptance: false, key,
    leftSourceSha256: left.source.sha256, rightSourceSha256: right.source.sha256,
    ...orderedUniqueAlignment(left.statements.map(r => r[key]), right.statements.map(r => r[key])) };
}
