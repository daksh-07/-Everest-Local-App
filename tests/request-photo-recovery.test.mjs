import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('app/request.tsx','utf8');
const code=ts.transpileModule(source.slice(source.indexOf('  async function choosePhotos()'),source.indexOf('  function chooseDate(')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(platform='web'){
 let finish;const picked=new Promise(resolve=>{finish=resolve});
 const calls={permissions:0,pickers:0,photos:[],busy:[],errors:[]};
 const env={photoPickerLock:{current:false},photoPickerEpoch:{current:0},draftOwner:{current:'owner-one'},busy:false,photos:[],Platform:{OS:platform},setError:value=>calls.errors.push(value),setPhotoPickerBusy:value=>calls.busy.push(value),setPhotos:fn=>calls.photos=fn(calls.photos),ImagePicker:{requestMediaLibraryPermissionsAsync:async()=>{calls.permissions++;return{granted:false}},launchImageLibraryAsync:()=>{calls.pickers++;return picked}}};
 vm.createContext(env);vm.runInContext(code,env);return{env,calls,finish};
}
test('web reattachment remains one user-triggered picker and ignores duplicate taps',async()=>{
 const h=harness();const pending=h.env.choosePhotos();await h.env.choosePhotos();assert.equal(h.calls.pickers,1);assert.equal(h.calls.permissions,0);h.finish({canceled:false,assets:[{uri:'fixture-only-memory'}]});await pending;assert.equal(h.calls.photos.length,1);assert.equal(h.calls.busy.at(-1),false);
});
test('a picker returning after navigation or account change cannot attach stale images',async()=>{
 for(const change of ['epoch','owner']){const h=harness();const pending=h.env.choosePhotos();if(change==='epoch')h.env.photoPickerEpoch.current++;else h.env.draftOwner.current='another-owner';h.finish({canceled:false,assets:[{uri:'private-old-owner-image'}]});await pending;assert.equal(h.calls.photos.length,0);}
});
test('native permission denial opens no picker and allows an explicit photo-free continuation',async()=>{
 const h=harness('ios');await h.env.choosePhotos();assert.equal(h.calls.permissions,1);assert.equal(h.calls.pickers,0);assert.match(h.calls.errors.at(-1),/continue without photos/);assert.equal(h.calls.busy.at(-1),false);
});
