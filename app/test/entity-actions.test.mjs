import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { loadGraph } from './loadGraph.mjs';
process.env.VITE_PREFIX = 'iclub-test';
let server, render, graph, local, views;
before(async () => {
 server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true } });
 render = (await server.ssrLoadModule('svelte/server')).render;
 graph = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
 local = (await server.ssrLoadModule('/src/lib/stores/local.ts')).local;
 views = Object.fromEntries(await Promise.all([['ladder','ladders/LadderActions'],['round','rounds/RoundActions'],['match','matches/MatchActions'],['team','teams/TeamActions'],['group','groups/GroupActions'],['userLadder','ladders/UserLadder'],['userTeam','teams/UserTeam']].map(async ([key,path]) => [key,(await server.ssrLoadModule(`/src/lib/components/${path}.svelte`)).default])));
 views.teamEdit = (await server.ssrLoadModule('/src/routes/team/[team_id]/edit/+page.svelte')).default;
});
after(async () => { await server?.close(); });
const has = (html, name) => html.includes(`aria-label="${name}"`);
async function show(kind, props, rows, caller = 'user_me') {
 await loadGraph(graph, rows); local.set({ caller_id: caller, device_id: null, connect_key: null });
 return render(views[kind], { props }).body;
}
test('ladder visitor sees selected settings and join; membership management starts collapsed', async () => {
 const ladder = { pk:'ladder',rk:'ladder_test',name:'Ladder',state:'active',format:'singles',ladder_system:'half_rank',match_format:'best_of_three' };
 const visitor = await show('ladder',{ladder},[ladder]);
 assert.match(visitor,/singles • half rank • best of three/);assert.equal(has(visitor,'request to join'),true);assert.equal(has(visitor,'help'),true);
 const adminOnly = await show('ladder',{ladder},[ladder,{pk:ladder.rk,rk:'user_me',is_admin:true}]);
 assert.equal(has(adminOnly,'request to join'),true);
 const member = await show('ladder',{ladder},[ladder,{pk:ladder.rk,rk:'user_me',is_participant:true,state:'active'}]);
 assert.equal(has(member,'More Options'),true);assert.equal(has(member,'request to join'),false);assert.equal(has(member,'away'),false);
});
test('round page only offers eligible confirmed availability choices for current members', async () => {
 const round={pk:'round',rk:'round_test',state:'pending'},team={pk:'team',rk:'team_test'};
 const rows=[{pk:team.rk,rk:'user_me',is_member:true},{pk:round.rk,rk:'user_me',role:'pending'}];
 let html=await show('round',{round,team},rows);assert.equal(has(html,'available'),true);assert.equal(has(html,'out'),true);assert.equal(has(html,'More Options'),false);
 rows[1].role='selected';html=await show('round',{round,team},rows);assert.match(html,/aria-label="available"[^>]*disabled/);assert.equal(has(html,'out'),true);
 assert.equal(has(await show('round',{round,team},rows,'user_other'),'out'),false);
 assert.equal(has(await show('round',{round:{...round,state:'complete'},team},rows),'out'),false);
});
test('match page shows accept for defenders/admins and forfeit only for participating users', async () => {
 const match={pk:'match',rk:'match_test',state:'pending'};
 const rows=[{pk:match.rk,rk:'user_me',role:'defender'},{pk:match.rk,rk:'ladder_test'},{pk:'ladder_test',rk:'user_admin',is_admin:true}];
 let html=await show('match',{match},rows);assert.equal(has(html,'accept'),true);assert.equal(has(html,'forfeit'),false);assert.equal(has(html,'More Options'),true);
 html=await show('match',{match},rows,'user_admin');assert.equal(has(html,'accept'),true);assert.equal(has(html,'forfeit'),false);
 html=await show('match',{match},rows,'user_other');assert.equal(has(html,'accept'),false);assert.equal(has(html,'forfeit'),false);
 html=await show('match',{match:{...match,state:'active'}},rows);assert.equal(has(html,'accept'),false);assert.equal(has(html,'forfeit'),false);assert.equal(has(html,'More Options'),true);
});


test('pending entity approvals follow their summaries as immediate actions', async () => {
 for(const [type,name] of [['ladder','approve this ladder'],['team','approve team'],['group','approve group']]) {
  const entity={pk:type,rk:`${type}_test`,name:'Pending entity',state:'pending',format:'singles',ladder_system:'win_points',match_format:'best_of_three',ext_association:'brta',ext_competition_name:'Tuesday Night',ext_section_name:'Section 1',ext_rank:3};
  const rows=[entity,{pk:entity.rk,rk:'club_test'},{pk:'club_test',rk:'user_me',is_admin:true}];
  const html=await show(type,{[type]:entity},rows);
  assert.equal(has(html,name),true);assert.match(html,new RegExp(`class="blue"[^>]*aria-label="${name}"`));
  assert.doesNotMatch(html,/aria-label="Pending"|pending approval|pending club approval/);
  if(type!=='group'){
   const summary=type==='ladder'?'singles • win points • best of three':'BRTA • Section 1 • rank 3';
   assert.ok(html.indexOf(summary)<html.indexOf(`aria-label="${name}"`));
   assert.equal((html.match(/class="group"/g)??[]).length,1);
  }
 }
});


test('team editor shows a read-only name and limits editing to team admins',async()=>{
 const rows=[{pk:'team',rk:'team_test',name:'Lobs',state:'active'},{pk:'team_test',rk:'user_me',is_admin:true}];
 await loadGraph(graph,rows);local.set({caller_id:'user_me',device_id:null,connect_key:null});
 const context=new Map([['__request__',{page:{params:{team_id:'team_test'}}}]]);
 const html=render(views.teamEdit,{context}).body;
 assert.match(html,/<input[^>]*aria-label="team name"[^>]*readonly/);assert.match(html,/value="Lobs"/);assert.equal(has(html,'update'),true);
 local.set({caller_id:'user_other',device_id:null,connect_key:null});const blocked=render(views.teamEdit,{context}).body;
 assert.match(blocked,/Only a team admin can edit this team/);assert.equal(has(blocked,'update'),false);assert.doesNotMatch(blocked,/aria-label="team name"/);
});


test('ladder sections show No pending matches without live matches, except when a challenge is available',async()=>{
 const user={pk:'user',rk:'user_me',name:'Casey'},ladder={pk:'ladder',rk:'ladder_test',name:'Ladder',format:'singles',state:'active'};
 const rows=[user,ladder,{pk:ladder.rk,rk:user.rk,is_participant:true,state:'active',rank:1}];
 let html=await show('userLadder',{user,ladder},rows);assert.match(html,/No pending matches/);assert.match(html,/d="M5 12h14"/);assert.equal(has(html,'No pending matches'),false);
 assert.match(await show('userLadder',{user,ladder},rows,'user_other'),/No pending matches/);
 const challengeRows=[...rows,{pk:'user',rk:'user_other',name:'Other'},{pk:ladder.rk,rk:'user_other',is_participant:true,state:'active',rank:2,points:2}];
 const eligible=await show('userLadder',{user,ladder},challengeRows,'user_other');assert.equal(has(eligible,'issue challenge'),true);assert.doesNotMatch(eligible,/No pending matches|cannot challenge/);
 for(const state of ['pending','active','complete']){
  const matches=[{pk:'match',rk:'match_test',name:'Match',state},{pk:user.rk,rk:'match_test',role:'challenger'},{pk:'match_test',rk:user.rk,role:'challenger'},{pk:'match_test',rk:ladder.rk}];
  html=await show('userLadder',{user,ladder},[...rows,...matches]);assert.equal(html.includes('No pending matches'),state==='complete');
 }
});
test('own team sections list only pending and playing rounds',async()=>{
 const user={pk:'user',rk:'user_me',name:'Casey'},entity={pk:'team',rk:'team_test',name:'Team',state:'active'},team={pk:user.rk,rk:entity.rk,is_member:true};
 const rows=[user,entity,{pk:entity.rk,rk:user.rk,is_member:true}];
 let html=await show('userTeam',{user,team},rows);assert.match(html,/No pending rounds/);assert.match(html,/d="M5 12h14"/);assert.equal(has(html,'No pending rounds'),false);
 assert.match(await show('userTeam',{user,team},rows,'user_other'),/No pending rounds/);
 for(const role of ['pending','selected','available','unavailable']){
  html=await show('userTeam',{user,team},[...rows,{pk:'round',rk:'round_test',name:'Round',state:'pending',ext_date:'2026-11-20'},{pk:entity.rk,rk:'round_test'},{pk:user.rk,rk:'round_test',role}]);
  assert.equal(html.includes('No pending rounds'),!['pending','selected'].includes(role));
 }
});
