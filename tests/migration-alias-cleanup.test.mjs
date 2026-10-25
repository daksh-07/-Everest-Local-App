import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,lstat,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
const script=resolve('scripts/prepare-legacy-migration-aliases.mjs');
const name='20260920221900_admin_rpc_execute_hardening.sql';
const run=(cwd,...args)=>spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});
test('test aliases can be prepared, removed and cleaned idempotently without migration copies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'everest-alias-'));
 try{
  assert.equal(run(root).status,0);
  const dir=join(root,'supabase/migrations'),files=await readdir(dir);
  assert.equal(files.length,95);
  for(const file of files)assert.equal((await lstat(join(dir,file))).isSymbolicLink(),true);
  assert.equal(run(root,'--clean').status,0);assert.deepEqual(await readdir(dir),[]);
  assert.equal(run(root,'--clean').status,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
for(const clean of [false,true])test((clean?'cleanup':'preparation')+' refuses to overwrite a real migration',async()=>{
 const root=await mkdtemp(join(tmpdir(),'everest-alias-'));
 try{
  const dir=join(root,'supabase/migrations');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,name),'-- irreplaceable migration\n');
  const result=run(root,...(clean?['--clean']:[]));assert.notEqual(result.status,0);
  assert.match(result.stderr,/Refusing to replace an unrecognized migration/);
  assert.equal(await readFile(join(dir,name),'utf8'),'-- irreplaceable migration\n');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('cleanup refuses an unknown symlink target',async()=>{
 const root=await mkdtemp(join(tmpdir(),'everest-alias-'));
 try{
  const dir=join(root,'supabase/migrations');await mkdir(dir,{recursive:true});await symlink('different.sql',join(dir,name));
  assert.notEqual(run(root,'--clean').status,0);assert.equal((await lstat(join(dir,name))).isSymbolicLink(),true);
 }finally{await rm(root,{recursive:true,force:true})}
});
