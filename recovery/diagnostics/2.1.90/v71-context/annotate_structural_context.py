"""Inert AST diagnostics. No compared program execution or acceptance mapping."""
import json, hashlib, re
from pathlib import Path

MISSING = object()
POSITIONS = {'start', 'end', 'range', 'loc'}
DECLS = {'ClassDeclaration','ClassExpression','FunctionDeclaration','FunctionExpression',
         'ArrowFunctionExpression','MethodDefinition','PropertyDefinition','VariableDeclarator'}
def digest(b): return hashlib.sha256(b).hexdigest()
def clean(x):
    if isinstance(x,list): return [clean(v) for v in x]
    if isinstance(x,dict): return {k:clean(v) for k,v in sorted(x.items()) if k not in POSITIONS}
    return x
def keys(x):
    return list(x) if isinstance(x,dict) else [str(i) for i in range(len(x))]
def get(x,k):
    if isinstance(x,dict): return x.get(k,MISSING)
    if isinstance(x,list) and re.fullmatch(r'0|[1-9][0-9]*',k):
        i=int(k)
        return x[i] if i<len(x) else MISSING
    return MISSING
def diffs(a,b,p=()):
    if isinstance(a,(dict,list)) and isinstance(b,(dict,list)):
        return [d for k in dict.fromkeys(keys(a)+keys(b)) for d in diffs(get(a,k),get(b,k),p+(k,))]
    if a is MISSING and b is MISSING: return []
    if type(a) is type(b) and a==b: return []
    row={'path':list(p)}
    if a is not MISSING: row['target']=a
    if b is not MISSING: row['current']=b
    return [row]
def canonical(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=True)
def context(side,path):
    text=side['text']; raw=text.encode('utf-16-le'); size=len(raw)//2
    if digest(text.encode()) != side['sha256']: raise ValueError('Statement digest')
    node=side['ast']; ancestors=[]; reached=[]; missing=None
    for depth in range(len(path)+1):
        if isinstance(node,dict) and isinstance(node.get('type'),str):
            bounds=node.get('range')
            if not isinstance(bounds,list) or len(bounds)!=2 or any(type(v)is not int for v in bounds): raise ValueError('Range schema')
            lo,hi=bounds
            if not 0<=lo<=hi<=size: raise ValueError('Range bounds')
            piece=raw[2*lo:2*hi].decode('utf-16-le')
            ancestors.append({'path':list(reached),'type':node['type'],'range':bounds,
                              'text':piece,'textSha256':digest(piece.encode())})
        if depth==len(path): break
        key=path[depth]
        if not isinstance(key,str): raise ValueError('Path key')
        if isinstance(node,list) and not re.fullmatch(r'0|[1-9][0-9]*',key): raise ValueError('Array index')
        nxt=get(node,key)
        if nxt is MISSING:
            missing={'atPath':path[:depth+1],'remainingPath':path[depth+1:]}; break
        reached.append(key);node=nxt
    return {'present':missing is None,'missing':missing,'resolvedPrefix':reached,
            'nearestNode':ancestors[-1] if ancestors else None,
            'parentNode':ancestors[-2] if len(ancestors)>1 else None,
            'enclosingDeclarations':[v for v in ancestors if v['type'] in DECLS],
            'statementSha256':side['sha256'],'rangeUnits':'statement-relative UTF-16 code units'}
def annotate(e):
    actual=diffs(clean(e['target']['ast']),clean(e['current']['ast']))
    supplied=e['targetRawDifferences']
    if len({tuple(d['path']) for d in supplied})!=len(supplied): raise ValueError('Duplicate difference')
    if sorted(map(canonical,actual))!=sorted(map(canonical,supplied)): raise ValueError('Incomplete raw differences')
    rows=[{'originalDifference':d,'current':context(e['current'],d['path']),
           'target':context(e['target'],d['path'])} for d in supplied]
    return {'currentIndex':e['currentIndex'],'targetIndex':e['targetIndex'],'owners':e['owners'],
            'differenceCount':len(rows),'differences':rows,
            'acceptanceCriterionChanged':False,'strictEqualityClaimed':False,
            'semanticEquivalenceClaimed':False,'constructionUsePermitted':False,
            'limitations':['Raw positional AST differences are not semantic edit correspondences.',
              'A missing field is distinct from a present null value.',
              'Parent/declaration contexts are syntactic; no binding or receiver resolution.',
              'Pinned producer AST is trusted beyond these data and text checks.',
              'Ordinary Literal.raw remains supplemental and does not change strict acceptance.']}
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--sha256',required=True)
    args=parser.parse_args()
    if re.fullmatch(r'[0-9a-f]{64}',args.sha256) is None: raise ValueError('Expected lowercase SHA256')
    data=args.input.read_bytes()
    if digest(data)!=args.sha256: raise ValueError('Input digest')
    result=annotate(json.loads(data));result['inputSha256']=args.sha256
    with args.output.open('x',encoding='utf-8') as f: f.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'currentIndex':result['currentIndex'],'targetIndex':result['targetIndex'],
                     'differenceCount':result['differenceCount'],'outputSha256':digest(args.output.read_bytes())}))
