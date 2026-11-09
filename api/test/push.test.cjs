process.env.RESOURCE_GROUP_PREFIX = 'test';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const webpush = require('web-push');
process.env.WEB_PUSH_VAPID_KEYS = JSON.stringify(webpush.generateVAPIDKeys());
const Module = require('node:module');
const original = Module._load;
const rows = new Map();
const sent = [];
let mockSend;
const rowKey = (pk,rk) => `${pk}|${rk}`;
const seed = (pk,rk,props) => rows.set(rowKey(pk,rk), {partitionKey:pk,rowKey:rk,etag:'version',...props});
class TableClient {
 async getEntity(pk,rk) {const row=rows.get(rowKey(pk,rk));if(!row)throw Object.assign(Error(),{statusCode:404});return {...row};}
 async updateEntity(row,mode,options) {
  const previous=await this.getEntity(row.partitionKey,row.rowKey);
  if(options?.etag && options.etag!==previous.etag)throw Object.assign(Error(),{statusCode:412});
  rows.set(rowKey(row.partitionKey,row.rowKey), mode==='Merge'?{...previous,...row}:row);
 }
 async *listEntities({queryOptions:{filter}}) {
  for(const row of [...rows.values()]) {
   const fields=[...filter.text.matchAll(/(PartitionKey|push_endpoint|url) eq /g)].map(m=>m[1]==='PartitionKey'?'partitionKey':m[1]);
   if(fields.every((field,i)=>row[field]===filter.values[i]))yield {...row};
  }
 }
}
Module._load=function(id){
 if(id==='web-push')return {...webpush,sendNotification:(...args)=>mockSend(...args)};
 if(id==='@azure/data-tables')return {TableClient,odata:(strings,...values)=>({text:strings.join(''),values})};
 if(id==='@azure/identity')return {DefaultAzureCredential:class{}};
 if(id==='@azure/functions')return {app:{http(){}}};
 return original.apply(this,arguments);
};
const {systemManifest}=require('../dist/src/functions/systemManifest');
const {userPush}=require('../dist/src/functions/userPush');
const {doSendPush}=require('../dist/src/services/doSendPush');
const {buildSignedMessage}=require('../dist/src/services/doSignatureVerification');
const context={warn(){},log(){}};
const endpoint='https://fcm.googleapis.com/fcm/send/test';
const browserKey=crypto.createECDH('prime256v1');browserKey.generateKeys();
const subscription={endpoint,keys:{p256dh:browserKey.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
let deviceKeys;
beforeEach(()=>{
 rows.clear();sent.length=0;
 deviceKeys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 seed('user_a','device_a',{key:deviceKeys.publicKey.export({format:'der',type:'spki'}).toString('base64')});
 mockSend=async(sub,payload,options)=>{sent.push({sub,payload:JSON.parse(payload),options});return {statusCode:201};};
});
after(()=>{Module._load=original;});
function request(sub=subscription,valid=true){
 const url='https://api.example/api/user/push';
 const signature=crypto.sign('sha256',Buffer.from(buildSignedMessage({callerId:'user_a',deviceId:'device_a',url})),{key:deviceKeys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
 return {url,headers:new Headers({origin:'https://app.example'}),json:async()=>({caller_id:'user_a',device_id:'device_a',signature:valid?signature:'bad',data:{subscription:sub}})};
}
test('signed registration merges subscription into existing device, preserving its authentication key',async()=>{
 const key=rows.get('user_a|device_a').key;
 assert.equal((await userPush(request(),context)).status,200);
 const row=rows.get('user_a|device_a');assert.equal(row.key,key);assert.equal(row.origin,'https://app.example');assert.equal(row.push_endpoint,endpoint);
 assert.equal(rows.size,1);
 assert.equal((await userPush(request(null),context)).status,200);assert.equal(rows.get('user_a|device_a').push_endpoint,'');assert.equal(rows.get('user_a|device_a').key,key);
});
test('registration rejects invalid signatures and non-provider endpoints',async()=>{
 assert.equal((await userPush(request(subscription,false),context)).status,401);
 for(const invalid of ['https://localhost/private','http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/test','https://fcm.googleapis.com:444/test'])
  assert.equal((await userPush(request({...subscription,endpoint:invalid}),context)).status,400);
 assert.equal(rows.get('user_a|device_a').push_endpoint,undefined);
});
test('rebinding a browser clears previous account/device binding without deleting their auth key',async()=>{
 seed('user_old','device_old',{key:'old-key',push_endpoint:endpoint});
 assert.equal((await userPush(request(),context)).status,200);
 assert.equal(rows.get('user_old|device_old').key,'old-key');assert.equal(rows.get('user_old|device_old').push_endpoint,'');
});
test('fan-out excludes actor, deduplicates subscriptions, uses each device origin and preserves payload',async()=>{
 await userPush(request(),context);
 seed('user_a','device_duplicate',{...rows.get('user_a|device_a'),partitionKey:'user_a',rowKey:'device_duplicate'});
 seed('user_b','device_b',{origin:'https://other.example',push_endpoint:endpoint+'2',push_p256dh:subscription.keys.p256dh,push_auth:subscription.keys.auth});
 const result=await doSendPush({userIds:['user_a','user_a','user_b','user_actor'],exceptUserId:'user_actor',heading:'Challenge',content:'Play now',path:'match/match_1',collapseId:'match_1'},context);
 assert.equal(result,true);assert.equal(sent.length,2);
 assert.deepEqual(sent.map(s=>s.payload.url),['https://app.example/match/match_1','https://other.example/match/match_1']);
 assert.equal(sent[0].payload.tag,'match_1');assert.equal(sent[0].payload.title,'Challenge');
 // Real web-push encryption and VAPID signing, without contacting an external provider.
 const details=webpush.generateRequestDetails(sent[0].sub,JSON.stringify(sent[0].payload),sent[0].options);
 assert.ok(details.body.length>0);assert.match(details.headers.Authorization,/^vapid /);assert.equal(details.headers['Content-Encoding'],'aes128gcm');
});
test('expired endpoints are cleared while auth survives; transient failures retain the subscription',async()=>{
 await userPush(request(),context);
 const message={userIds:['user_a'],heading:'Test',content:'Update',path:'/'};
 mockSend=async()=>{throw {statusCode:503};};
 assert.equal(await doSendPush(message,context),false);assert.equal(rows.get('user_a|device_a').push_endpoint,endpoint);
 mockSend=async()=>{throw {statusCode:410};};
 assert.equal(await doSendPush(message,context),false);assert.equal(rows.get('user_a|device_a').push_endpoint,'');assert.ok(rows.get('user_a|device_a').key);
});


test('manifest selects the club for the visiting origin and keeps navigation on that origin',async()=>{
 seed('club','club_next',{name:'Next Club',url:'next.intra.club',foreground:'#E75480',background:'#B67233'});
 const result=await systemManifest({query:new URLSearchParams({origin:'https://next.intra.club'})});
 assert.equal(result.status,200);assert.equal(result.headers['Content-Type'],'application/manifest+json');
 assert.equal(result.jsonBody.name,'Next Club');assert.equal(result.jsonBody.theme_color,'#E75480');
 assert.equal(result.jsonBody.start_url,'https://next.intra.club/');assert.equal(result.jsonBody.scope,'https://next.intra.club/');
 assert.equal(result.jsonBody.icons[0].src,'https://testxsa.blob.core.windows.net/public/club_next.jpg');
 for(const origin of ['https://unknown.example','https://next.intra.club/path','http://next.intra.club','not-a-url'])
  assert.equal((await systemManifest({query:new URLSearchParams({origin})})).status,404);
});
test('push uses each subscription origin brand without requiring user-club relations',async()=>{
 await userPush(request(),context);
 seed('club','club_a',{name:'Club A',url:'app.example',foreground:'#00BFFF',background:'#E75480'});
 seed('club','club_b',{name:'Club B',url:'other.example',foreground:'#E75480',background:'#B67233'});
 seed('user_a','device_other',{origin:'https://other.example',push_endpoint:endpoint+'other',push_p256dh:subscription.keys.p256dh,push_auth:subscription.keys.auth});
 assert.equal(await doSendPush({userIds:['user_a'],heading:'Match update',content:'Updated',path:'match/match_1'},context),true);
 assert.deepEqual(sent.map(s=>s.payload.icon),['https://testxsa.blob.core.windows.net/public/club_a.jpg','https://testxsa.blob.core.windows.net/public/club_b.jpg']);
 assert.deepEqual(sent.map(s=>s.payload.badge),sent.map(s=>s.payload.icon));
 assert.deepEqual(sent.map(s=>new URL(s.payload.url).origin),['https://app.example','https://other.example']);
});
