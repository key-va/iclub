process.env.RESOURCE_GROUP_PREFIX = 'iclub-test';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const rows = new Map();
const pushes = [];
const versions = new Map();
let rejectSignature = false;
const key = (pk, rk) => `${pk}|${rk}`;
const entity = (pk, rk, attributes = {}) => rows.set(key(pk,rk), { partitionKey: pk, rowKey: rk, timestamp: new Date(), ...attributes });
const relation = (a,b,attributes={}) => { entity(a,b,attributes); entity(b,a,attributes); };
const get = (pk,rk) => rows.get(key(pk,rk));
class TableClient {
    async getEntity(pk,rk) { const row = get(pk,rk); if (!row) throw Object.assign(new Error('Missing'),{statusCode:404}); return {...row, etag: String(versions.get(key(pk,rk)) ?? 0)}; }
    async updateEntity(row, mode, options) {
        const id=key(row.partitionKey,row.rowKey), current=get(row.partitionKey,row.rowKey);
        if(options?.etag !== undefined && options.etag !== String(versions.get(id) ?? 0)) throw {statusCode:412};
        versions.set(id,(versions.get(id) ?? 0)+1);rows.set(id,{...current,...row});
    }
    async upsertEntity(row) { entity(row.partitionKey,row.rowKey,row); }
    async *listEntities({queryOptions:{filter}}) {
        const fields = [...filter.text.matchAll(/(PartitionKey|state) eq /g)].map(m => m[1] === 'PartitionKey' ? 'partitionKey' : m[1]);
        for (const row of [...rows.values()]) if (fields.every((field,i) => row[field] === filter.values[i])) yield {...row};
    }
}
Module._load = function(id, parent, isMain) {
    if (id === '@azure/data-tables') return {TableClient, odata: (strings,...values) => ({text:strings.join(''),values})};
    if (id === '@azure/identity') return {DefaultAzureCredential:class {}};
    if (id === '@azure/functions') return {app:{http(){},timer(){}}};
    if (id.endsWith('/doSignatureVerification')) return {doSignatureVerification:async()=>{if(rejectSignature)throw Error('Invalid signature');}};
    if (id.endsWith('/doGuidsToPublic')) return {doGuidsToPublic:async()=>{}};
    if (id.endsWith('/doSendPush')) return {doSendPush:async(message)=>{pushes.push(message);return false;}};
    return originalLoad.apply(this,arguments);
};
const load = name => require(`../dist/src/functions/${name}.js`)[name];
const join=load('ladderJoin'), accept=load('ladderAccept'), create=load('matchCreate'), matchAccept=load('matchAccept');
const complete=load('matchComplete'), forfeit=load('matchForfeit'), retire=load('pairRetire'), message=load('messageCreate'), batch=load('batchHourly');
const {doCompleteMatch}=require('../dist/src/services/doCompleteMatch.js');
const {doFindDueMatches}=require('../dist/src/services/doFindDueMatches.js');
const context={log(){},warn(){}};
const L='ladder_test', A='user_a', B='user_b', C='user_c', D='user_d', ADMIN='user_admin';
const req=(caller,data,params={})=>({params,url:'https://test/api',json:async()=>({caller_id:caller,device_id:'device_test',signature:'test',data})});
const call=(handler,caller,data,params={})=>handler(req(caller,data,params),context);
function seed(format='doubles',system='win_points') {
    entity('ladder',L,{name:'Test ladder',format,state:'active',ladder_system:system,cool_period:2,play_period:9});
    relation(L,ADMIN,{is_admin:true});
    for (const id of [A,B,C,D,ADMIN,'user_outsider']) entity('user',id,{name:id});
}
function pair(id, users,rank,state='active') {
    entity('pair',id,{name:users.join(' and '),ladder_id:L});
    relation(L,id,{is_participant:true,rank,points:rank,state});
    for (const user of users) { relation(id,user,{role:'member'}); relation(L,user,{is_participant:true,state:'active'}); }
}
function doubles(system='win_points') { seed('doubles',system);pair('pair_top',[A,B],1);pair('pair_bottom',[C,D],2); }
async function challenge(caller=D) {
    const r=await call(create,caller,{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'});
    assert.equal(r.status,201,JSON.stringify(r));return r.jsonBody.subject;
}
function mirrored() {
    for(const row of rows.values()) {
        if (!row.partitionKey.includes('_')) continue;
        const opposite=get(row.rowKey,row.partitionKey);
        assert.ok(opposite,`missing mirror ${key(row.rowKey,row.partitionKey)}`);
        const attrs=({partitionKey,rowKey,timestamp,...rest})=>rest;
        assert.deepEqual(attrs(row),attrs(opposite));
    }
}
beforeEach(()=>{rows.clear();versions.clear();pushes.length=0;rejectSignature=false;});
after(()=>{Module._load=originalLoad;});

test('individual requests stay pending; only admin can pair two distinct pending users',async()=>{
    seed();
    for (const user of [A,B]) { assert.equal((await call(join,user,undefined,{ladder_id:L})).status,200);assert.equal(get(L,user).state,'pending'); }
    assert.equal((await call(accept,A,{user_ids:[A,B]},{ladder_id:L})).status,403);
    assert.equal((await call(accept,ADMIN,{user_ids:[A,A]},{ladder_id:L})).status,400);
    const r=await call(accept,ADMIN,{user_ids:[B,A]},{ladder_id:L});assert.equal(r.status,200);
    const id=r.jsonBody.data.pair_id;
    assert.equal(get('pair',id).ladder_id,L);assert.equal(get(id,A).role,'member');assert.equal(get(id,B).role,'member');
    assert.equal(get(L,id).rank,1);assert.equal(get(L,A).is_admin,undefined);
    assert.equal((await call(accept,ADMIN,{user_ids:[A,B]},{ladder_id:L})).status,409);mirrored();
});

test('either partner can challenge and either defending partner can accept; only the defending side/admin accepts',async()=>{
    for (const challenger of [C,D]) for (const defender of [A,B]) {
        rows.clear();doubles();const id=await challenge(challenger);
        assert.equal(get('match',id).name,'user_c and user_d vs user_a and user_b');
        assert.equal((await call(matchAccept,C,undefined,{match_id:id})).status,403);
        assert.equal((await call(matchAccept,defender,undefined,{match_id:id})).status,200);
        assert.deepEqual(new Set(pushes.at(-1).userIds),new Set([C,D]));
        assert.equal(get(L,'pair_top').state,'busy');assert.equal(get(id,A).competitor_id,'pair_top');mirrored();
    }
});

test('singles match names use full player names and retain the missing-name fallback',async()=>{
    seed('singles');
    relation(L,A,{is_participant:true,rank:1,points:1,state:'active'});
    relation(L,C,{is_participant:true,rank:2,points:2,state:'active'});
    get('user',C).name='  Andre Agassi  ';get('user',A).name='Pete Sampras';
    const data={ladder_id:L,challenger_id:C,defender_id:A};
    const r=await call(create,C,data);assert.equal(r.status,201);
    assert.equal(get('match',r.jsonBody.subject).name,'Andre Agassi vs Pete Sampras');
    assert.equal(pushes.at(-1).heading,'Andre Agassi vs Pete Sampras');
    assert.equal(r.jsonBody.message,'Okay, match Andre Agassi vs Pete Sampras created');
    get(L,A).state='active';get(L,C).state='active';
    get('user',C).name='  ';delete get('user',A).name;
    const fallback=await call(create,C,data);assert.equal(fallback.status,201);
    assert.equal(get('match',fallback.jsonBody.subject).name,'Player vs Player');
});

test('all four participants may submit results; ranks, points, cooling and user history are pair-aware',async()=>{
    for (const caller of [A,B,C,D]) {
        rows.clear();doubles();const id=await challenge();await call(matchAccept,A,undefined,{match_id:id});
        assert.equal((await call(complete,'user_outsider',{challenger_score:6,defender_score:2},{match_id:id})).status,403);
        assert.equal((await call(complete,caller,{challenger_score:6,defender_score:2},{match_id:id})).status,200);
        assert.equal(get(L,'pair_bottom').rank,1);assert.equal(get(L,'pair_bottom').points,5);
        assert.equal(get(L,'pair_top').rank,2);assert.equal(get(L,'pair_top').state,'cooling');
        assert.equal(get(id,D).result,'winner');assert.equal(get(id,B).score,2);
        assert.deepEqual(new Set(pushes.at(-1).userIds),new Set([A,B,C,D]));
        assert.equal((await call(complete,caller,{challenger_score:6,defender_score:2},{match_id:id})).status,409);mirrored();
    }
});

test('either member can forfeit for their side; outsider cannot; challenger keeps points on withdrawal',async()=>{
    for (const caller of [A,B,C,D]) {
        rows.clear();doubles();const id=await challenge();
        assert.equal((await call(forfeit,'user_outsider',undefined,{match_id:id})).status,403);
        assert.equal((await call(forfeit,caller,undefined,{match_id:id})).status,200);
        const losingPair=[A,B].includes(caller)?'pair_top':'pair_bottom';
        assert.equal(get(id,losingPair).result,'forfeiter');
        if(losingPair==='pair_bottom')assert.equal(get(L,'pair_bottom').points,2);mirrored();
    }
});

test('match messaging is open to signed-in users and pushes target only the four participants',async()=>{
    doubles();const id=await challenge();
    assert.equal((await call(message,'user_outsider',{match_id:id,text:'Good luck!'})).status,201);
    assert.deepEqual(new Set(pushes.at(-1).userIds),new Set([A,B,C,D]));
    assert.ok(!pushes.at(-1).userIds.includes(ADMIN));
});

test('pair retirement forfeits pending/active matches, closes gaps, preserves history and returns both members to pending',async()=>{
    for (const state of ['pending','active']) {
        rows.clear();doubles();const id=await challenge();if(state==='active')await call(matchAccept,A,undefined,{match_id:id});
        assert.equal((await call(retire,'user_outsider',undefined,{pair_id:'pair_top'})).status,403);
        assert.equal((await call(retire,B,undefined,{pair_id:'pair_top'})).status,200);
        assert.equal(get('match',id).state,'complete');assert.equal(get(id,'pair_top').result,'forfeiter');
        assert.equal(get(L,'pair_top').state,'retired');assert.equal(get(L,'pair_top').rank,undefined);
        assert.equal(get(L,'pair_bottom').rank,1);
        for(const user of [A,B]){assert.equal(get(L,user).state,'pending');assert.equal(get(L,user).is_participant,false);assert.equal(get('pair_top',user).role,'member');}
        assert.equal((await call(accept,ADMIN,{user_ids:[A,B]},{ladder_id:L})).status,200);
        assert.equal((await call(retire,A,undefined,{pair_id:'pair_top'})).status,409);mirrored();
    }
});

test('admin may retire a pair without matches; retirement preserves completed match history',async()=>{
    doubles();const id=await challenge();await call(matchAccept,A,undefined,{match_id:id});await call(complete,C,{challenger_score:6,defender_score:2},{match_id:id});
    const old={...get(id,'pair_top')};assert.equal((await call(retire,ADMIN,undefined,{pair_id:'pair_top'})).status,200);
    assert.deepEqual(get(id,'pair_top'),old);assert.equal(get(L,'pair_bottom').rank,1);mirrored();
});

test('scheduled processing handles doubles deadlines, bot pushes and cooling release',async()=>{
    doubles();const id=await challenge();get('match',id).timestamp=new Date(Date.now()-3*86400000);
    assert.equal((await doFindDueMatches('pending'))[0].defenderId,'pair_top');
    await batch({},context);assert.equal(get('match',id).state,'complete');
    assert.equal(get(id,'pair_top').result,'forfeiter');assert.deepEqual(new Set(pushes.at(-1).userIds),new Set([A,B,C,D]));
    get(L,'pair_top').timestamp=new Date(Date.now()-3*86400000);await batch({},context);assert.equal(get(L,'pair_top').state,'active');mirrored();
});

test('active doubles matches expire after play period; 12-hour warnings target four players',async()=>{
    doubles();const id=await challenge();await call(matchAccept,B,undefined,{match_id:id});
    get('match',id).timestamp=new Date(Date.now()-(9*24-11.5)*3600000);await batch({},context);
    assert.equal(get('match',id).state,'active');assert.match(pushes.at(-1).content,/warning/);assert.equal(pushes.at(-1).userIds.length,4);
    get('match',id).timestamp=new Date(Date.now()-10*86400000);await batch({},context);assert.equal(get('match',id).state,'complete');
});

test('format mismatch, overlapping pairs, busy opponents, reach and signature checks reject invalid challenges',async()=>{
    doubles();
    assert.equal((await call(create,C,{ladder_id:L,challenger_id:C,defender_id:A})).status,400);
    assert.equal((await call(create,'user_outsider',{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'})).status,403);
    get(L,'pair_bottom').points=0;assert.equal((await call(create,C,{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'})).status,409);
    get(L,'pair_bottom').points=2;get(L,'pair_top').state='busy';assert.equal((await call(create,C,{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'})).status,409);
    rejectSignature=true;assert.equal((await call(retire,B,undefined,{pair_id:'pair_top'})).status,401);
});

test('singles joining, acceptance, challenges, scoring, messaging and forfeit remain supported',async()=>{
    seed('singles');
    for(const user of [A,C]){await call(join,user,undefined,{ladder_id:L});assert.equal((await call(accept,ADMIN,{user_id:user},{ladder_id:L})).status,200);}
    const r=await call(create,C,{ladder_id:L,challenger_id:C,defender_id:A});assert.equal(r.status,201);const id=r.jsonBody.subject;
    await call(matchAccept,A,undefined,{match_id:id});
    assert.equal((await call(complete,C,{challenger_score:6,defender_score:1},{match_id:id})).status,200);
    assert.equal(get(L,C).rank,1);assert.equal(get(L,A).state,'cooling');assert.deepEqual(new Set(pushes.at(-1).userIds),new Set([A,C]));
    await call(message,B,{match_id:id,text:'Well played'});assert.equal(pushes.at(-1).userIds.length,2);
    get(L,A).state='active';const again=await call(create,A,{ladder_id:L,challenger_id:A,defender_id:C});assert.equal(again.status,201);
    assert.equal((await call(forfeit,A,undefined,{match_id:again.jsonBody.subject})).status,200);mirrored();
});

test('doubles completion uses the supported rank-based rules, including rank shifts',async()=>{
    for(const system of ['half_rank','the_percent_fixed','static_1']){
        rows.clear();doubles(system);if(system==='the_percent_fixed')for(let i=0;i<8;i++)pair(`pair_filler_${i}`,[`user_filler_${i}_a`,`user_filler_${i}_b`],i+3);const id=await challenge();await call(matchAccept,A,undefined,{match_id:id});
        await call(complete,D,{challenger_score:6,defender_score:0},{match_id:id});
        assert.equal(get(L,'pair_bottom').rank,1);assert.equal(get(L,'pair_bottom').points,2);assert.equal(get(L,'pair_top').rank,2);
    }
});

test('completion refuses a forfeiter who is not a competitor',async()=>{
    doubles();const id=await challenge();assert.equal((await doCompleteMatch({matchId:id,forfeiterId:'pair_unknown'},context)).status,400);
});

test('pair membership is ladder-specific; retirement closes middle gaps and preserves admin flags',async()=>{
    doubles();entity('user','user_e',{name:'E'});entity('user','user_f',{name:'F'});pair('pair_third',['user_e','user_f'],3);
    relation(L,A,{is_admin:true,is_participant:true,state:'active'});
    const other='ladder_other';entity('ladder',other,{name:'Other',format:'doubles',state:'active',ladder_system:'win_points'});relation(other,ADMIN,{is_admin:true});
    relation(other,A,{state:'pending'});relation(other,C,{state:'pending'});
    assert.equal((await call(accept,ADMIN,{user_ids:[A,C]},{ladder_id:other})).status,200);
    assert.equal((await call(retire,D,undefined,{pair_id:'pair_bottom'})).status,200);
    assert.equal(get(L,'pair_top').rank,1);assert.equal(get(L,'pair_third').rank,2);
    assert.equal(get(other,C).state,'active');
    assert.equal((await call(retire,A,undefined,{pair_id:'pair_top'})).status,200);assert.equal(get(L,A).is_admin,true);
    assert.equal(get('pair_top',A).role,'member');mirrored();
});

test('overlapping pairs cannot challenge; retired pairs cannot start matches',async()=>{
    doubles();relation('pair_top',C,{role:'member'});
    assert.equal((await call(create,C,{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'})).status,409);
    rows.delete(key('pair_top',C));rows.delete(key(C,'pair_top'));get(L,'pair_bottom').is_participant=false;
    assert.equal((await call(create,C,{ladder_id:L,challenger_id:'pair_bottom',defender_id:'pair_top'})).status,409);
});

test('multi-set results, invalid scores and zero cooling work for doubles',async()=>{
    doubles();get('ladder',L).match_format='best_of_three';get('ladder',L).cool_period=0;
    const id=await challenge();await call(matchAccept,B,undefined,{match_id:id});
    assert.equal((await call(complete,A,{challenger_score:[6,2],defender_score:[2,6]},{match_id:id})).status,400);
    assert.equal((await call(complete,D,{challenger_score:[6,2,6],defender_score:[2,6,4]},{match_id:id})).status,200);
    assert.equal(get(id,'pair_bottom').score,'6,2,6');assert.equal(get(L,'pair_bottom').points,2);assert.equal(get(L,'pair_top').state,'active');
});

test('retirement handles every unresolved match but preserves already completed matches',async()=>{
    doubles();const id=await challenge();
    // Historical storage can contain multiple unresolved matches; retirement must close all of them.
    entity('match','match_extra',{name:'Extra',state:'active'});relation('match_extra',L);relation('match_extra','pair_top',{role:'challenger'});relation('match_extra','pair_bottom',{role:'defender'});
    assert.equal((await call(retire,A,undefined,{pair_id:'pair_top'})).status,200);
    assert.equal(get('match',id).state,'complete');assert.equal(get('match','match_extra').state,'complete');assert.equal(get(L,'pair_bottom').rank,1);mirrored();
});

test('singles deadline processing and away still work; doubles away is pair-aware',async()=>{
    const away=load('ladderAway');seed('singles');relation(L,A,{is_participant:true,rank:1,points:1,state:'active'});relation(L,C,{is_participant:true,rank:2,points:2,state:'active'});
    const r=await call(create,C,{ladder_id:L,challenger_id:C,defender_id:A});const id=r.jsonBody.subject;
    get('match',id).timestamp=new Date(Date.now()-3*86400000);await batch({},context);assert.equal(get('match',id).state,'complete');
    assert.equal((await call(away,A,undefined,{ladder_id:L})).status,200);
    rows.clear();doubles();assert.equal((await call(away,A,undefined,{ladder_id:L})).status,200);assert.equal(get(L,'pair_top').state,'away');
});



test('fixed ten percent enforces the same ladder-size range for singles and doubles',async()=>{
 for(const format of ['singles','doubles']) for(const [count,rank,target,expected] of [[60,20,14,201],[60,20,13,409],[60,50,44,201],[60,50,43,409],[69,20,13,409],[70,20,13,201],[70,20,12,409],[9,9,8,409],[10,9,8,201]]){
  rows.clear();seed(format,'the_percent_fixed');
  const challenger=format==='doubles'?'pair_bottom':C,defender=format==='doubles'?'pair_top':A;
  if(format==='doubles'){pair(challenger,[C,D],rank);pair(defender,[A,B],target);}
  else {relation(L,challenger,{is_participant:true,rank,state:'active'});relation(L,defender,{is_participant:true,rank:target,state:'active'});}
  for(let i=0;i<count-2;i++){
   if(format==='doubles')pair(`pair_extra_${i}`,[`user_extra_${i}_a`,`user_extra_${i}_b`],i+100,i%2?'away':'cooling');
   else relation(L,`user_extra_${i}`,{is_participant:true,rank:i+100,state:i%2?'away':'cooling'});
  }
  relation(L,`${format==='doubles'?'pair':'user'}_pending`,{state:'pending'});
  relation(L,`${format==='doubles'?'pair':'user'}_left`,{is_participant:false});
  const response=await call(create,C,{ladder_id:L,challenger_id:challenger,defender_id:defender});
  assert.equal(response.status,expected,`${format}: ${count} entries, rank ${rank} targeting ${target}`);
 }
});

test('missing cooldown settings use three days for pending deadlines and notifications',async()=>{
 doubles();delete get('ladder',L).cool_period;
 const id=await challenge();assert.match(pushes[0].content,/within 3 days/);
 get('match',id).timestamp=new Date(Date.now()-2.5*86400000);
 assert.deepEqual(await doFindDueMatches('pending'),[]);
 get('match',id).timestamp=new Date(Date.now()-3.5*86400000);
 assert.equal((await doFindDueMatches('pending'))[0].matchId,id);
});


test('static_1 allows a challenge one place up and rejects more distant targets',async()=>{
 for(const format of ['singles','doubles']) for(const [target,expected] of [[3,201],[2,409]]){
  rows.clear();seed(format,'static_1');
  const challenger=format==='doubles'?'pair_bottom':C,defender=format==='doubles'?'pair_top':A;
  if(format==='doubles'){pair(challenger,[C,D],4);pair(defender,[A,B],target);}
  else {relation(L,challenger,{is_participant:true,rank:4,state:'active'});relation(L,defender,{is_participant:true,rank:target,state:'active'});}
  assert.equal((await call(create,C,{ladder_id:L,challenger_id:challenger,defender_id:defender})).status,expected);
 }
});

test('missing cooldown settings cool a losing competitor for three days',async()=>{
 doubles();delete get('ladder',L).cool_period;
 const id=await challenge();await call(matchAccept,A,undefined,{match_id:id});
 assert.equal((await call(complete,C,{challenger_score:6,defender_score:0},{match_id:id})).status,200);
 assert.equal(get(L,'pair_top').state,'cooling');
 get(L,'pair_top').timestamp=new Date(Date.now()-2.5*86400000);
 await batch({},context);assert.equal(get(L,'pair_top').state,'cooling');
 get(L,'pair_top').timestamp=new Date(Date.now()-3.5*86400000);
 await batch({},context);assert.equal(get(L,'pair_top').state,'active');
});


const {membershipAction}=require('../dist/src/functions/membership.js');
const membership=(type,action,caller,id=L)=>membershipAction(req(caller,undefined,{[`${type}_id`]:id}),context,type,action);
test('doubles away forfeits matches, preserves partner status, and only cools when both return',async()=>{
 doubles();const id=await challenge();await call(matchAccept,A,undefined,{match_id:id});
 assert.equal((await membership('ladder','away',A)).status,200);
 assert.equal(get('match',id).state,'complete');assert.equal(get(id,'pair_top').result,'forfeiter');
 assert.equal(get(L,A).state,'away');assert.equal(get(L,B).state,'active');assert.equal(get(L,'pair_top').state,'away');
 assert.equal((await membership('ladder','away',B)).status,200);
 assert.equal((await membership('ladder','return',A)).status,200);
 assert.equal(get(L,A).state,'active');assert.equal(get(L,B).state,'away');assert.equal(get(L,'pair_top').state,'away');
 assert.equal((await membership('ladder','return',B)).status,200);assert.equal(get(L,'pair_top').state,'cooling');
 assert.equal((await membership('ladder','return',B)).status,409);mirrored();
});
test('leave checks the last admin before forfeiture; doubles withdrawal removes both memberships and closes rank gaps',async()=>{
 doubles();relation(L,ADMIN,{is_admin:false});relation(L,A,{is_participant:true,state:"active",is_admin:true});const id=await challenge();
 assert.equal((await membership('ladder','leave',B)).status,409);assert.equal(get('match',id).state,'pending');assert.equal(get(L,'pair_top').is_participant,true);
 relation(L,ADMIN,{is_admin:true});assert.equal((await membership('ladder','leave',B)).status,200);
 assert.equal(get('match',id).state,'complete');assert.equal(get(L,'pair_top').is_participant,false);assert.equal(get(L,'pair_top').rank,undefined);
 for(const user of [A,B]){assert.equal(get(L,user).state,'left');assert.equal(get(L,user).is_participant,false);}
 assert.equal(get(L,'pair_bottom').rank,1);mirrored();
});
test('singles away forfeits pending matches and return enters cooling; leaving then closes ranks',async()=>{
 seed('singles');relation(L,A,{is_participant:true,rank:1,state:'active'});relation(L,C,{is_participant:true,rank:2,state:'active',points:2});
 const match=await call(create,C,{ladder_id:L,challenger_id:C,defender_id:A});
 assert.equal((await membership('ladder','away',C)).status,200);assert.equal(get('match',match.jsonBody.subject).state,'complete');assert.equal(get(L,C).state,'away');
 assert.equal((await membership('ladder','return',C)).status,200);assert.equal(get(L,C).state,'cooling');
 assert.equal((await membership('ladder','leave',C)).status,200);assert.equal(get(L,C).state,'left');assert.equal(get(L,A).rank,1);mirrored();
});
test('team and group leave reject the last admin, preserve history, and withdraw future availability',async()=>{
 for(const type of ['team','group']){
  rows.clear();const id=`${type}_test`;entity(type,id,{state:'active'});relation(id,A,{is_admin:true,is_participant:true,is_member:true});
  entity('round','round_future',{state:'pending'});relation(id,'round_future',{});relation('round_future',A,{role:'selected'});
  entity('round','round_past',{state:'complete'});relation(id,'round_past',{});relation('round_past',A,{role:'selected'});
  assert.equal((await membership(type,'leave',A,id)).status,409);
  relation(id,B,{is_admin:true});assert.equal((await membership(type,'leave',A,id)).status,200);
  assert.equal(get(id,A).state,'left');assert.equal(get(id,A).is_admin,false);
  if(type==='team'){assert.equal(get('round_future',A).role,'unavailable');assert.equal(get('round_past',A).role,'selected');}
  assert.equal((await membership(type,'leave',A,id)).status,409);mirrored();
 }
});
test('membership changes reject invalid signatures and unrelated users without graph writes',async()=>{
 doubles();const before=JSON.stringify([...rows]);rejectSignature=true;
 assert.equal((await membership('ladder','away',A)).status,401);assert.equal(JSON.stringify([...rows]),before);
 rejectSignature=false;assert.equal((await membership('ladder','away','user_outsider')).status,409);assert.equal(JSON.stringify([...rows]),before);
});


test('membership guard prevents simultaneous partner changes from losing the pair state',async()=>{
 doubles();
 let results=await Promise.all([membership('ladder','away',A),membership('ladder','away',B)]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const second=get(L,A).state==='away'?B:A;assert.equal((await membership('ladder','away',second)).status,200);
 results=await Promise.all([membership('ladder','return',A),membership('ladder','return',B)]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const remaining=get(L,A).state==='away'?A:B;assert.equal(get(L,'pair_top').state,'away');
 assert.equal((await membership('ladder','return',remaining)).status,200);assert.equal(get(L,'pair_top').state,'cooling');
 assert.equal(get('ladder',L).operation_guard,0);mirrored();
});
test('simultaneous admin departures leave an administrator and busy operations reject without membership writes',async()=>{
 const id='group_test';entity('group',id,{state:'active'});relation(id,A,{is_admin:true,is_participant:true});relation(id,B,{is_admin:true,is_participant:true});
 const results=await Promise.all([membership('group','leave',A,id),membership('group','leave',B,id)]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const remaining=get(id,A).is_admin?A:B;assert.equal((await membership('group','leave',remaining,id)).status,409);
 rows.clear();doubles();get('ladder',L).operation_guard=Date.now()+60000;
 assert.equal((await membership('ladder','away',A)).status,409);assert.equal(get(L,A).state,'active');assert.equal(get(L,'pair_top').state,'active');
});
