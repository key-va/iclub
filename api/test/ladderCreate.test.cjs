process.env.RESOURCE_GROUP_PREFIX='test';
const {test,beforeEach,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const Module=require('node:module');const original=Module._load;
const rows=new Map(),blobs=new Map(),downloads=[],pushes=[];let exported=false;
const key=(pk,rk)=>`${pk}|${rk}`;
function seed(pk,rk,properties={}){rows.set(key(pk,rk),{partitionKey:pk,rowKey:rk,...properties});}
class TableClient{
 async getEntity(pk,rk){const r=rows.get(key(pk,rk));if(!r)throw {statusCode:404};return {...r};}
 async upsertEntity(row){rows.set(key(row.partitionKey,row.rowKey),{...row});}
 async *listEntities({queryOptions:{filter}}){
  const fields=[...filter.text.matchAll(/(PartitionKey|url) eq /g)].map(m=>m[1]==='PartitionKey'?'partitionKey':m[1]);
  for(const row of rows.values())if(fields.every((f,i)=>row[f]===filter.values[i]))yield {...row};
 }
}
class BlobServiceClient{
 getContainerClient(container){assert.equal(container,'public');return {getBlockBlobClient:name=>({
  downloadToBuffer:async()=>{downloads.push(name);if(!blobs.has(name))throw {statusCode:404};return blobs.get(name);},
  uploadData:async(bytes,options)=>{assert.equal(options.blobHTTPHeaders.blobContentType,'image/jpeg');blobs.set(name,bytes);}
 })};}
}
Module._load=function(id){
 if(id==='@azure/functions')return {app:{http(){}}};
 if(id==='@azure/identity')return {DefaultAzureCredential:class{}};
 if(id==='@azure/data-tables')return {TableClient,odata:(strings,...values)=>({text:strings.join(''),values})};
 if(id==='@azure/storage-blob')return {BlobServiceClient};
 if(id.endsWith('/doSignatureVerification'))return {doSignatureVerification:async()=>{}};
 if(id.endsWith('/doGuidsToPublic'))return {doGuidsToPublic:async()=>exported=true};
 if(id.endsWith('/doSendPush'))return {doSendPush:async p=>{pushes.push(p);return true;}};
 return original.apply(this,arguments);
};
const {ladderCreate}=require('../dist/src/functions/ladderCreate');
const context={log(){},warn(){}};
const icon=Buffer.from('origin club JPEG bytes');
beforeEach(()=>{rows.clear();blobs.clear();pushes.length=0;downloads.length=0;exported=false;seed('club','club_intra',{url:'app.intra.club'});seed('club','club_next',{url:'next.intra.club'});blobs.set('club_next.jpg',icon);});
after(()=>Module._load=original);
async function create(origin='https://next.intra.club',extra={}){
 return ladderCreate({url:'https://api.example/api/ladder/create',headers:new Headers(origin?{origin}:{}),json:async()=>({caller_id:'user_admin',device_id:'device_test',signature:'test',data:{name:'Ladder',club_id:'club_intra',...extra}})},context);
}
test('default ladder image copies the visiting origin club JPEG into its own blob',async()=>{
 const r=await create();assert.equal(r.status,201);const id=r.jsonBody.subject;
 assert.deepEqual(downloads,['club_next.jpg']);assert.deepEqual(blobs.get(`${id}.jpg`),icon);assert.deepEqual(blobs.get('club_next.jpg'),icon);
 assert.ok(rows.has(key(id,'club_next')));assert.ok(rows.has(key('club_next',id)));assert.equal(rows.get(key(id,'user_admin')).is_admin,true);assert.equal(exported,true);
});
test('an uploaded ladder image takes priority over origin branding',async()=>{
 const custom=Buffer.from([0xff,0xd8,0xff,0x01]);const r=await create('https://next.intra.club',{image:custom.toString('base64')});
 assert.equal(r.status,201);assert.deepEqual(downloads,[]);assert.deepEqual(blobs.get(`${r.jsonBody.subject}.jpg`),custom);
});
test('unknown/missing origins cannot choose a club; missing known club image falls back',async()=>{
 for(const origin of ['', 'https://unknown.example']){const r=await create(origin);assert.equal(r.status,400);}
 const fallback=fs.readFileSync(path.join(__dirname,'../src/assets/icon-00.jpg'));
 blobs.delete('club_next.jpg');const r=await create();assert.equal(r.status,201);assert.deepEqual(blobs.get(`${r.jsonBody.subject}.jpg`),fallback);
});

test('ladder creation notification names the requesting player and links to the ladder',async()=>{
 seed('user','user_admin',{name:'Alice Player'});seed('club_next','user_reviewer',{is_admin:true});
 const r=await create();assert.equal(r.status,201);assert.equal(pushes.length,1);
 assert.equal(pushes[0].content,'Alice Player has requested to create this ladder');
 assert.deepEqual(pushes[0].userIds,['user_reviewer']);assert.equal(pushes[0].path,`ladder/${r.jsonBody.subject}`);
});
