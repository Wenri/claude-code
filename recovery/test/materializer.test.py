import hashlib,importlib.util,io,json,tarfile,tempfile,unittest,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
loader=importlib.util.spec_from_file_location('materializer',HERE.parent/'scripts/materialize-baseline-inputs.py');module=importlib.util.module_from_spec(loader);loader.loader.exec_module(module)
def sha(b):return hashlib.sha256(b).hexdigest()
class Materializer(unittest.TestCase):
 def fixture(self,mutation=None,long=False):
  root=Path(tempfile.mkdtemp(prefix='.tiny-archive-',dir=HERE));archive=root/'input.tgz';files={'a.ts':b'export const a=1;\n','sub/b.txt':b'source asset\n'};meta={'README.md':b'test\n','INPUT-MANIFEST.json':b'{}\n'}
  if long:files['long/'+'segment/'*16+'file.txt']=b'long source path\n'
  rows=[('inputs/'+p,b,tarfile.REGTYPE,'') for p,b in files.items()]+[(p,b,tarfile.REGTYPE,'') for p,b in meta.items()]
  if mutation:mutation(rows)
  with tarfile.open(archive,'w:gz') as t:
   for name,data,kind,link in rows:
    item=tarfile.TarInfo(name);item.type=kind;item.linkname=link;item.size=len(data);t.addfile(item,io.BytesIO(data))
  pin=lambda b:{'bytes':len(b),'sha256':sha(b)}
  spec={'files':[{'path':p,**pin(b)} for p,b in files.items()],'metadata':{p:pin(b) for p,b in meta.items()},'archive':{'bytes':archive.stat().st_size,'sha256':module.digest_file(archive)}}
  return root,archive,spec
 def reject(self,mutation):
  root,archive,spec=self.fixture(mutation);out=root/'new';self.assertRaises(AssertionError,module.materialize,archive,spec,out);self.assertFalse(out.exists())
 def test_valid_and_existing_output(self):
  root,a,s=self.fixture();out=root/'new';r=module.materialize(a,s,out);self.assertEqual(r['files'],2);self.assertEqual((out/'a.ts').read_bytes(),b'export const a=1;\n');self.assertRaises(AssertionError,module.materialize,a,s,out)
 def test_traversal(self):self.reject(lambda r:r.append(('inputs/../escape',b'',tarfile.REGTYPE,'')))
 def test_absolute(self):self.reject(lambda r:r.append(('/escape',b'',tarfile.REGTYPE,'')))
 def test_duplicate(self):self.reject(lambda r:r.append(r[0]))
 def test_symlink(self):self.reject(lambda r:r.append(('inputs/link',b'',tarfile.SYMTYPE,'a.ts')))
 def test_hardlink(self):self.reject(lambda r:r.append(('inputs/link',b'',tarfile.LNKTYPE,'inputs/a.ts')))
 def test_directory(self):self.reject(lambda r:r.append(('inputs/dir',b'',tarfile.DIRTYPE,'')))
 def test_unlisted(self):self.reject(lambda r:r.append(('inputs/x',b'x',tarfile.REGTYPE,'')))
 def test_missing(self):self.reject(lambda r:r.pop(0))
 def test_size(self):self.reject(lambda r:r.__setitem__(0,(r[0][0],b'other',r[0][2],'')))
 def test_hash(self):self.reject(lambda r:r.__setitem__(0,(r[0][0],b'X'*len(r[0][1]),r[0][2],'')))
 def test_container_hash(self):
  root,a,s=self.fixture();s['archive']['sha256']='0'*64;self.assertRaises(AssertionError,module.materialize,a,s,root/'new');self.assertFalse((root/'new').exists())
 def test_output_symlink(self):
  root,a,s=self.fixture();(root/'alias').symlink_to(root,target_is_directory=True);self.assertRaises(AssertionError,module.materialize,a,s,root/'alias'/'new')
 def test_optimized_python_refuses_before_output(self):
  root,a,s=self.fixture();out=root/'new';run=subprocess.run([sys.executable,'-O',str(HERE.parent/'scripts/materialize-baseline-inputs.py'),'--output-root',str(out)],capture_output=True,text=True);self.assertNotEqual(run.returncode,0);self.assertIn('Optimized Python disables required validation',run.stderr);self.assertFalse(out.exists())
 def test_exact_long_path_pax_allowed(self):
  root,a,s=self.fixture(long=True);r=module.materialize(a,s,root/'new');self.assertEqual(r['files'],3)
 def test_other_pax_attributes_rejected(self):
  root,a,s=self.fixture();members=[]
  with tarfile.open(a,'r:gz') as t:
   for m in t:members.append((m,t.extractfile(m).read()))
  members[0][0].pax_headers={'mtime':'1.2'}
  with tarfile.open(a,'w:gz') as t:
   for m,b in members:t.addfile(m,io.BytesIO(b))
  s['archive']={'bytes':a.stat().st_size,'sha256':module.digest_file(a)};self.assertRaises(AssertionError,module.materialize,a,s,root/'new');self.assertFalse((root/'new').exists())
if __name__=='__main__':unittest.main()
