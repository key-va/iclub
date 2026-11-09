process.env.RESOURCE_GROUP_PREFIX='test';
const {test,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');const crypto=require('node:crypto');
const Module=require('node:module');const original=Module._load;
const stores={guids:new Map(),auths:new Map()};let deletes=0,exportsCount=0,authReads=0;
const key=(pk,rk)=>`${pk}|${rk}`;
const seed=(table,pk,rk,props={})=>stores[table].set(key(pk,rk),{partitionKey:pk,rowKey:rk,...props});
class TableClient{
 constructor(url,table){this.table=table;}
 async getEntity(pk,rk){if(this.table==='auths')authReads++;const row=stores[this.table].get(key(pk,rk));if(!row)throw {statusCode:404};return {...row};}
 async *listEntities(options={}){
  const filter=options.queryOptions?.filter;
  const fields=filter?[...filter.text.matchAll(/(PartitionKey|url) eq /g)].map(m=>m[1]==='PartitionKey'?'partitionKey':m[1]):[];
  for(const row of [...stores[this.table].values()])if(fields.every((field,i)=>row[field]===filter.values[i]))yield {...row};
 }
 async deleteEntity(pk,rk){deletes++;stores[this.table].delete(key(pk,rk));}
 async createEntity(row){stores[this.table].set(key(row.partitionKey,row.rowKey),{...row});}
}
Module._load=function(id){
 if(id==='@azure/functions')return {app:{http(){}}};
 if(id==='@azure/identity')return {DefaultAzureCredential:class{}};
 if(id==='@azure/data-tables')return {TableClient,odata:(strings,...values)=>({text:strings.join(''),values})};
 if(id.endsWith('/doGuidsToPublic'))return {doGuidsToPublic:async()=>{exportsCount++;return stores.guids.size;}};
 if(id.endsWith('/doAssetFromPublic'))return {doAssetFromPublic:async()=>{}};
 return original.apply(this,arguments);
};
const {doSignatureVerification,doBotVerification,buildSignedMessage}=require('../dist/src/services/doSignatureVerification');
const {systemRestore}=require('../dist/src/functions/systemRestore');
const {systemAbout}=require('../dist/src/functions/systemAbout');
const {systemManifest}=require('../dist/src/functions/systemManifest');
const {ladderDelete}=require('../dist/src/functions/ladderDelete');
const context={error(){},log(){},warn(){}};
const botId='bot_0000-00-00_00-00-00_bootstrap00b';const botKey='test-only-bot-key-never-a-real-secret';
beforeEach(()=>{Object.values(stores).forEach(s=>s.clear());deletes=exportsCount=authReads=0;process.env.INTRA_CLUB_BOT_KEY=botKey;delete process.env.SYSTEM_BOT_SECRET;});
after(()=>Module._load=original);
const restore=body=>systemRestore({json:async()=>body},context);
test('bot key replaces cryptographic signature without a registered device or auth lookup',async()=>{
 await doSignatureVerification({callerId:botId,signature:botKey,url:'https://api.example/api/test'},context);
 assert.equal(authReads,0);
 await assert.rejects(doSignatureVerification({callerId:botId,signature:'wrong',url:'/api/test'}),/Invalid bot key/);
 assert.throws(()=>doBotVerification({callerId:'user_someone',signature:botKey}),/bot caller_id/);
});
test('missing or unresolved key fails closed and legacy SYSTEM_BOT_SECRET is not accepted',()=>{
 delete process.env.INTRA_CLUB_BOT_KEY;process.env.SYSTEM_BOT_SECRET=botKey;
 assert.throws(()=>doBotVerification({callerId:botId,signature:botKey}),/not configured/);
 for(const value of ['@Microsoft.KeyVault(VaultName=test;SecretName=intra-club-bot-key)','@microsoft.keyvault(unresolved)']){
  process.env.INTRA_CLUB_BOT_KEY=value;assert.throws(()=>doBotVerification({callerId:botId,signature:value}),/not configured/);
 }
});
test('normal users still require a device and a valid ECDSA signature; bot key cannot impersonate a user',async()=>{
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 seed('auths','user_test','device_test',{key:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')});
 const input={callerId:'user_test',deviceId:'device_test',url:'https://api.example/api/test'};
 const signature=crypto.sign('sha256',Buffer.from(buildSignedMessage(input)),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
 await doSignatureVerification({...input,signature});
 await assert.rejects(doSignatureVerification({...input,signature:botKey}));
 await assert.rejects(doSignatureVerification({callerId:'user_test',signature:botKey,url:input.url}),/Device ID/);
 await assert.rejects(doSignatureVerification({...input,url:'/api/other',signature}));
});
test('restore rejects unauthenticated, wrong-key and normal-user callers without deleting data',async()=>{
 seed('guids','club','club_existing',{name:'Preserved'});
 for(const auth of [{},{caller_id:botId,signature:'wrong'},{caller_id:'user_test',signature:botKey}]){
  const response=await restore({...auth,data:[]});assert.equal(response.status,401);assert.equal(deletes,0);assert.equal(stores.guids.size,1);assert.equal(exportsCount,0);
  assert.equal(JSON.stringify(response).includes(botKey),false);
 }
 assert.equal((await restore([])).status,401);
});
test('restore supports an empty bootstrap database and the authenticated data envelope',async()=>{
 const rows=[{pk:'bot',rk:botId,name:'Bot'},{pk:'club',rk:'club_test',name:'Restored'}];
 const response=await restore({caller_id:botId,signature:botKey,data:rows});assert.equal(response.status,200);assert.equal(stores.guids.size,2);assert.equal(exportsCount,1);
 const invalid=await restore({caller_id:botId,signature:botKey,data:[{pk:'club'}]});assert.equal(invalid.status,400);assert.equal(deletes,0);
 const cleared=await restore({caller_id:botId,signature:botKey,data:[]});assert.equal(cleared.status,200);assert.equal(deletes,2);assert.equal(stores.guids.size,0);
});
test('about and manifest remain public and never expose the bot key',async()=>{
 seed('guids','club','club_next',{name:'Next Club',url:'next.intra.club',foreground:'#00BFFF',background:'#B67233'});
 const about=await systemAbout({},context);assert.equal(about.status,200);assert.equal(JSON.stringify(about).includes(botKey),false);
 const manifest=await systemManifest({query:new URLSearchParams({origin:'https://next.intra.club'})});assert.equal(manifest.status,200);assert.equal(JSON.stringify(manifest).includes(botKey),false);
});
test('bot calls can omit device_id but still require the existing ladder-admin permission',async()=>{
 seed('guids','ladder','ladder_test',{name:'Test'});
 const request={params:{ladder_id:'ladder_test'},url:'https://api.example/api/ladder/ladder_test/delete',json:async()=>({caller_id:botId,signature:botKey})};
 assert.equal((await ladderDelete(request,context)).status,403);assert.equal(deletes,0);
 seed('guids','ladder_test',botId,{is_admin:true});seed('guids',botId,'ladder_test',{is_admin:true});
 assert.equal((await ladderDelete(request,context)).status,200);assert.equal(stores.guids.has(key('ladder','ladder_test')),false);
});
