const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../scripts/configure-web-push.cjs'),'utf8');
function setup(first, create = {status:0,stderr:''}) {
 const calls=[],files=[],removed=[];
 const execute=()=>vm.runInNewContext(script, {
  process:{env:{RESOURCE_GROUP_PREFIX:'next'}},console:{log(){}},
  require:id=>{
   if(id==='node:child_process')return {spawnSync:(_cmd,args)=>{
    calls.push(args);
    if(args[0]==='resource'&&args[1]==='show')return first;
    if(args[0]==='resource'&&args[1]==='create')return create;
    return {status:0,stderr:''};
   }};
   if(id==='node:fs')return {mkdtempSync:()=>'/tmp/test-push',writeFileSync:(...args)=>files.push(args),rmSync:(...args)=>removed.push(args)};
   if(id==='web-push')return {generateVAPIDKeys:()=>({publicKey:'public',privateKey:'private'})};
   return require(id);
  }
 });
 return {execute,calls,files,removed};
}
test('setup reuses secret metadata without reading values or generating another pair',()=>{
 const s=setup({status:0,stdout:'web-push-vapid-keys',stderr:''});s.execute();
 assert.equal(s.calls.length,2);assert.equal(s.files.length,0);
 assert.ok(s.calls[0].includes('name'));assert.equal(s.calls.some(c=>c[0]==='keyvault'),false);
});
test('setup recognizes both Azure missing-resource error formats and creates protected secret file',()=>{
 for(const stderr of ['ERROR: (ResourceNotFound) missing',"ERROR: Operation returned an invalid status 'Not Found'"]){
  const s=setup({status:1,stderr});s.execute();
  assert.equal(s.calls.length,3);assert.equal(s.calls[1][1],'create');
  assert.equal(s.files[0][2].mode,0o600);assert.equal(s.removed.length,1);
  assert.deepEqual(JSON.parse(JSON.parse(s.files[0][1]).value),{publicKey:'public',privateKey:'private'});
 }
});
test('setup fails on denied metadata access and cleans up generated material on provision failure',()=>{
 const forbidden=setup({status:1,stderr:'Forbidden'});
 assert.throws(forbidden.execute,/Cannot inspect/);assert.equal(forbidden.calls.length,1);
 const failed=setup({status:1,stderr:'ResourceNotFound'},{status:1,stderr:'Provision failed'});
 assert.throws(failed.execute,/Cannot provision/);assert.equal(failed.removed.length,1);
});
