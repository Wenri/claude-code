import assert from 'node:assert/strict';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', values=new Map([...alphabet].map((c,i)=>[c,i]));
export function decode(segment){let out=[],value=0,shift=0;for(const c of segment){const b=values.get(c);assert(b!==undefined);value+=(b&31)*2**shift;assert(Number.isSafeInteger(value));if(b&32){shift+=5;assert(shift<53);}else{out.push(value%2?-Math.floor(value/2):Math.floor(value/2));value=0;shift=0;}}assert.equal(shift,0);return out;}
export function encode(fields){let out='';for(const n of fields){assert(Number.isSafeInteger(n));let value=n<0?-n*2+1:n*2;assert(Number.isSafeInteger(value));do{let digit=value%32;value=Math.floor(value/32);out+=alphabet[digit|(value?32:0)];}while(value);}return out;}
const upper=(a,value,field)=>{let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>1;if(a[mid][field]<=value)lo=mid+1;else hi=mid;}return lo;};
export function composeIdentifierMap({map,code,renamedCode,edits}){
 assert.equal(map.version,3);assert(!Object.hasOwn(map,'sections'),'Indexed maps are unsupported');assert(Array.isArray(map.sources)&&map.sources.every(x=>typeof x==='string'));assert(Array.isArray(map.names)&&map.names.every(x=>typeof x==='string'));
 if(Object.hasOwn(map,'sourcesContent'))assert(Array.isArray(map.sourcesContent)&&map.sourcesContent.length===map.sources.length&&map.sourcesContent.every(x=>x===null||typeof x==='string'));
 for(const key of ['file','sourceRoot'])if(Object.hasOwn(map,key))assert.equal(typeof map[key],'string');
 const starts=[0];for(let i=0;i<code.length;i++){if(code[i]==='\n')starts.push(i+1);else assert(!'\r\u2028\u2029'.includes(code[i]),'Unsupported generated line separator');}
 const byLine=new Map();let end=0,reconstructed='';
 for(const e of edits){assert(Number.isSafeInteger(e.start)&&Number.isSafeInteger(e.end)&&e.start>=end&&e.end>e.start&&e.end<=code.length);assert.equal(code.slice(e.start,e.end),e.old);assert.equal(typeof e.replacement,'string');assert(e.replacement.length>0&&!/[\r\n\u2028\u2029]/u.test(e.old+e.replacement));
  reconstructed+=code.slice(end,e.start)+e.replacement;end=e.end;
  let lo=0,hi=starts.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(starts[mid]<=e.start)lo=mid;else hi=mid;}
  const line=byLine.get(lo)||[];const delta=e.replacement.length-(e.end-e.start);line.push({start:e.start-starts[lo],end:e.end-starts[lo],delta,cumulative:(line.at(-1)?.cumulative||0)+delta});byLine.set(lo,line);
 }
 reconstructed+=code.slice(end);assert.equal(reconstructed,renamedCode,'Map edits do not reconstruct actual named bytes');
 let src=0,ol=0,oc=0,name=0,outSrc=0,outOL=0,outOC=0,outName=0;
 let line=0,gen=0,outGen=0,active=null,out='',hasOutput=false,kept=0,dropped=0,inserted=0,boundaryCursor=0;
 const boundaryLists=new Map();for(const [line,list]of byLine){const points=[];for(const e of list){for(const p of [e.start,e.end])if(points.at(-1)!==p)points.push(p);}boundaryLists.set(line,points);}
 const cuts=()=>byLine.get(line)||[];
 const translated=col=>{const a=cuts(),i=upper(a,col,'end');return col+(i?a[i-1].cumulative:0);};
 const interior=col=>{const a=cuts(),i=upper(a,col,'start');return i>0&&col>a[i-1].start&&col<a[i-1].end;};
 function emit(col,state){const column=translated(col);assert(Number.isSafeInteger(column)&&column>=outGen);const fields=[column-outGen];outGen=column;if(state){fields.push(state.src-outSrc,state.ol-outOL,state.oc-outOC);outSrc=state.src;outOL=state.ol;outOC=state.oc;if(state.name!==undefined){fields.push(state.name-outName);outName=state.name;}}if(hasOutput)out+=',';out+=encode(fields);hasOutput=true;}
 function before(col,exact){const points=boundaryLists.get(line)||[];while(boundaryCursor<points.length&&points[boundaryCursor]<col){emit(points[boundaryCursor++],active);inserted++;}if(exact)while(boundaryCursor<points.length&&points[boundaryCursor]===col)boundaryCursor++;}
 const input=map.mappings;assert.equal(typeof input,'string');
 assert(!input.startsWith(',')&&!input.endsWith(',')&&!input.includes(',,')&&!input.includes(',;')&&!input.includes(';,'),'Empty comma segment');
 for(let at=0;at<input.length;){let stop=at;while(stop<input.length&&input[stop]!==','&&input[stop]!==';')stop++;
  if(stop>at){const f=decode(input.slice(at,stop));assert([1,4,5].includes(f.length));assert(f[0]>=0);gen+=f[0];assert(Number.isSafeInteger(gen));assert(line<starts.length);const lineLength=(line+1<starts.length?starts[line+1]-1:code.length)-starts[line];assert(gen<=lineLength,'Mapping beyond generated line');before(gen,true);
   if(f.length>1){src+=f[1];ol+=f[2];oc+=f[3];assert([src,ol,oc].every(Number.isSafeInteger)&&src>=0&&src<map.sources.length&&ol>=0&&oc>=0);if(f.length===5){name+=f[4];assert(Number.isSafeInteger(name)&&name>=0&&name<map.names.length);}active={src,ol,oc,...(f.length===5?{name}:{})};}else active=null;
   if(interior(gen))dropped++;else{emit(gen,active);kept++;}
  }
  if(stop<input.length&&input[stop]===';'){before(Infinity,false);out+=';';line++;assert(line<starts.length,'Mapping beyond generated file');gen=0;outGen=0;active=null;hasOutput=false;boundaryCursor=0;}at=stop+1;
 }
 before(Infinity,false);assert([...byLine.keys()].every(x=>x<=line),'Edited code outside represented map lines');
 return {map:{...map,mappings:out},summary:{edits:edits.length,keptOriginalSegments:kept,droppedChangedIdentifierInteriorSegments:dropped,insertedIdentifierBoundarySegments:inserted,generatedLineCountUnchanged:true,originalSourceAndNameCoordinatesChanged:false,queryContract:'Every unchanged generated character retains its original same-line GLB source/name state. Each replacement start retains the old identifier-start state; changed interiors use that state; replacement ends restore the old end state. Source/name tables and all other map metadata are unchanged.',mapCompositionAloneEstablishesReleaseAcceptance:false}};
}
