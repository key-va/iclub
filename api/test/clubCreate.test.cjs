process.env.RESOURCE_GROUP_PREFIX='test';
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const Module=require('node:module');const original=Module._load;
const rows=new Map(),blobs=new Map();let exportCount=0,failUpload=false,failExport=false,failRelation=false,jpeg;
const key=(pk,rk)=>`${pk}|${rk}`;
class TableClient{
 async getEntity(pk,rk){const row=rows.get(key(pk,rk));if(!row)throw {statusCode:404};return {...row};}
 async *listEntities({queryOptions:{filter}}){for(const row of rows.values())if(row.partitionKey===filter.values[0]&&row.url===filter.values[1])yield {...row};}
 async upsertEntity(row){if(failRelation&&row.partitionKey.startsWith('club_'))throw Error('relation failure');rows.set(key(row.partitionKey,row.rowKey),{...row});}
 async deleteEntity(pk,rk){rows.delete(key(pk,rk));}
}
Module._load=function(id){
 if(id==='@azure/data-tables')return {TableClient,odata:(strings,...values)=>({values})};
 if(id==='@azure/identity')return {DefaultAzureCredential:class{}};
 if(id==='@azure/functions')return {app:{http(){}}};
 if(id.endsWith('/doSignatureVerification'))throw Error('Unsigned endpoint must not import signature verification');
 if(id.endsWith('/doAssetToPublic'))return {doAssetToPublic:async(buffer,name)=>{if(failUpload&&name.endsWith('_192.png'))throw Error('upload failure');blobs.set(name,buffer);}};
 if(id.endsWith('/doAssetFromPublic'))return {doAssetFromPublic:async name=>blobs.delete(name)};
 if(id.endsWith('/doGuidsToPublic'))return {doGuidsToPublic:async()=>{if(failExport)throw Error('export failure');exportCount++;}};
 return original.apply(this,arguments);
};
const {clubCreate}=require('../dist/src/functions/clubCreate');
const context={error(){}};
before(async()=>{jpeg=await sharp({create:{width:512,height:512,channels:3,background:'#00BFFF'}}).jpeg().toBuffer();});
beforeEach(()=>{rows.clear();blobs.clear();exportCount=0;failUpload=failExport=failRelation=false;rows.set(key('user','user_admin'),{partitionKey:'user',rowKey:'user_admin',name:'Admin'});});
after(()=>Module._load=original);
function data(extra={}){return {name:'New Club',url:'new.intra.club',foreground:'#FF1493',background:'#00BFFF',street:'Test Street',suburb:'Elwood',postcode:'3184',custom_attribute:'kept',admin_user_id:'user_admin',image:jpeg.toString('base64'),...extra};}
const call=async attributes=>clubCreate({json:async()=>({data:attributes})},context);
test('unsigned creation stores all club attributes and mirrored admin rows and creates correctly sized icons',async()=>{
 const response=await call(data({url:'NEW.INTRA.CLUB',image:'data:image/jpeg;base64,'+jpeg.toString('base64')}));
 assert.equal(response.status,201);const id=response.jsonBody.subject;assert.match(id,/^club_/);
 const club=rows.get(key('club',id));assert.equal(club.url,'new.intra.club');assert.equal(club.custom_attribute,'kept');assert.equal(club.street,'Test Street');assert.equal(club.image,undefined);assert.equal(club.admin_user_id,undefined);
 assert.deepEqual(rows.get(key(id,'user_admin')),{partitionKey:id,rowKey:'user_admin',is_admin:true});
 assert.deepEqual(rows.get(key('user_admin',id)),{partitionKey:'user_admin',rowKey:id,is_admin:true});
 assert.deepEqual(blobs.get(`${id}.jpg`),jpeg);assert.equal(blobs.size,4);assert.equal(exportCount,1);
 for(const size of [180,192,512]){const m=await sharp(blobs.get(`${id}_${size}.png`)).metadata();assert.equal(m.width,size);assert.equal(m.height,size);assert.equal(m.format,'png');}
});
test('invalid attributes, missing admin and duplicate hostname fail before writes',async()=>{
 for(const extra of [{name:''},{url:'https://new.intra.club/path'},{foreground:'pink'},{pk:'user'},{rowKey:'user_admin'},{custom_attribute:{nested:true}},{admin_user_id:'bot_admin'}])assert.equal((await call(data(extra))).status,400);
 assert.equal((await call(data({admin_user_id:'user_missing'}))).status,404);
 rows.set(key('club','club_existing'),{partitionKey:'club',rowKey:'club_existing',url:'new.intra.club'});
 assert.equal((await call(data())).status,409);assert.equal(blobs.size,0);assert.equal(exportCount,0);
});
test('wrong image formats, incorrect dimensions and corrupt JPEG data are rejected',async()=>{
 const wrongSize=await sharp(jpeg).resize(256,256).jpeg().toBuffer();
 const png=await sharp(jpeg).png().toBuffer();
 for(const image of ['not base64',wrongSize.toString('base64'),png.toString('base64'),jpeg.subarray(0,100).toString('base64')])assert.equal((await call(data({image}))).status,400);
 assert.equal(blobs.size,0);assert.equal(rows.size,1);
});
test('failed uploads or graph writes clean up only new resources',async()=>{
 for(const failure of ['upload','relation']){
  failUpload=failure==='upload';failRelation=failure==='relation';
  assert.equal((await call(data())).status,500);assert.equal(blobs.size,0);assert.equal(rows.size,1);assert.ok(rows.has(key('user','user_admin')));assert.equal(exportCount,0);
 }
});
test('failed publication retains a complete club and identifies it for recovery',async()=>{
 failExport=true;const response=await call(data());assert.equal(response.status,503);assert.equal(response.jsonBody.data.created,true);
 assert.ok(rows.has(key('club',response.jsonBody.subject)));assert.equal(blobs.size,4);
});
