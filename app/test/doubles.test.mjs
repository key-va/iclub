import { loadGraph } from './loadGraph.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_PREFIX = 'iclub-test';
let server, summary, challenge, branding, guids;
before(async () => {
    server = await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error',optimizeDeps:{noDiscovery:true}});
    guids = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
    branding = await server.ssrLoadModule('/src/lib/stores/branding.ts');
    summary = await server.ssrLoadModule('/src/lib/components/matches/matchRules.ts');
    challenge = await server.ssrLoadModule('/src/lib/components/ladders/ladderRules.ts');
});
after(async () => { await server?.close(); });

test('doubles match summaries use pair outcomes rather than duplicated participant outcomes',async()=>{
    const items=[
        {pk:'pair',rk:'pair_one',name:'A and B'},{pk:'pair',rk:'pair_two',name:'C and D'},
        {pk:'user',rk:'user_a',name:'A'},{pk:'user',rk:'user_c',name:'C'},
        {pk:'match_test',rk:'pair_one',role:'challenger',result:'winner',score:'6,7'},
        {pk:'match_test',rk:'pair_two',role:'defender',result:'loser',score:'2,5'},
        {pk:'match_test',rk:'user_a',role:'participant',result:'winner',score:'6,7'},
        {pk:'match_test',rk:'user_c',role:'participant',result:'loser',score:'2,5'}
    ];
    await loadGraph(guids, items);
    assert.equal(summary.matchSummary('match_test'),'A and B wins 6-2 7-5');
    items[5].result='forfeiter';await loadGraph(guids, items);assert.equal(summary.matchSummary('match_test'),'A and B wins by forfeit 6-2 7-5');
});

test('singles summaries and completed history filtering remain unchanged',async()=>{
    const items=[{pk:'user',rk:'user_a',name:'A'},{pk:'user',rk:'user_b',name:'B'},
        {pk:'match_test',rk:'user_a',role:'challenger',result:'winner',score:6},
        {pk:'match_test',rk:'user_b',role:'defender',result:'loser',score:2}];
    await loadGraph(guids, items);
    assert.equal(summary.matchSummary('match_test'),'A wins 6-2');
    const matches = [{pk:'match',rk:'match_pending',state:'pending'},{pk:'match',rk:'match_active',state:'active'},{pk:'match',rk:'match_done',state:'complete'}];
    await loadGraph(guids, matches);
    assert.deepEqual(summary.pastMatches(matches).map(row => row.rk), ['match_done']);
});

test('challenge controls work for pair and user competitors across rank, reach and state rules',()=>{
    for(const prefix of ['pair','user']){
        const me={is_participant:true,rank:4,points:3,state:'active'};
        const target={rk:`${prefix}_other`,rank:2,relation:{is_participant:true,state:'cooling'}};
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},me,`${prefix}_me`,target),true);
        assert.equal(challenge.canChallenge({ladder_system:'half_rank'},me,`${prefix}_me`,target),true);
        assert.equal(challenge.canChallenge({ladder_system:'static_1'},me,`${prefix}_me`,{...target,rank:3}),true);
        assert.equal(challenge.canChallenge({ladder_system:'static_1'},me,`${prefix}_me`,target),false);
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},{...me,state:'busy'},`${prefix}_me`,target),false);
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},me,target.rk,target),false);
    }
});


test('hostname selects branding without user/club relations, with safe fallback colours',()=>{
 const rows=[{pk:'club',rk:'club_c',name:'Intra Club',url:'app.intra.club',foreground:'#FF1493',background:'#00BFFF'},
  {pk:'club',rk:'club_n',name:'Next Club',url:'next.intra.club',foreground:'#00BFFF',background:'#B67233',foreground_text:'#111111',background_text:'#222222'}];
 const next=branding.brandingForHost(rows,'next.intra.club');
 assert.equal(next.name,'Next Club');assert.equal(next.foreground,'#00BFFF');assert.equal(next.background,'#B67233');
 assert.equal(next.foregroundText,'#111111');assert.equal(next.backgroundText,'#222222');assert.match(next.icon,/club_n\.jpg$/);
 assert.equal(branding.brandingForHost(rows,'APP.INTRA.CLUB').name,'Intra Club');
 const fallback=branding.brandingForHost(rows,'localhost');
 assert.equal(fallback.clubId,null);assert.equal(fallback.foregroundText,'#FFFFFF');assert.equal(fallback.backgroundText,'#FFFFFF');
 rows[1].foreground='url(https://bad.example)';rows[1].foreground_text='red';
 const invalid=branding.brandingForHost(rows,'next.intra.club');
 assert.equal(invalid.foreground,'#FF1493');assert.equal(invalid.foregroundText,'#FFFFFF');
});



test('fixed ten percent counts current ranked entries, not the challenger rank or unrelated relations',async()=>{
 for(const prefix of ['user','pair']) for(const [count,rank,target,expected] of [[60,20,14,true],[60,20,13,false],[60,50,44,true],[60,50,43,false],[69,20,13,false],[70,20,13,true],[70,20,12,false],[9,9,8,false],[10,9,8,true]]){
  const ladder={pk:'ladder',rk:'ladder_fixed',format:prefix==='pair'?'doubles':'singles',ladder_system:'the_percent_fixed'};
  const rows=Array.from({length:count},(_,i)=>({pk:ladder.rk,rk:`${prefix}_${i}`,is_participant:true,rank:i+1,state:i%2?'away':'cooling'}));
  rows.push({pk:ladder.rk,rk:`${prefix}_pending`,state:'pending'}, {pk:ladder.rk,rk:`${prefix}_left`,is_participant:false}, {pk:ladder.rk,rk:'user_admin',is_admin:true});
  if(prefix==='pair') for(let i=0;i<count*2;i++)rows.push({pk:ladder.rk,rk:`user_member_${i}`,is_participant:true});
  await loadGraph(guids,rows);
  const me={is_participant:true,rank,state:'active'};
  const opponent={rk:`${prefix}_other`,rank:target,relation:{is_participant:true,state:'active'}};
  assert.equal(challenge.canChallenge(ladder,me,`${prefix}_me`,opponent),expected,`${prefix}: ${count} entries, rank ${rank} targeting ${target}`);
 }
});

test('ladder settings offer readable option labels and the supported cooldown limits',async()=>{
 const {ladderSettings,ladderSettingDefaults}=await server.ssrLoadModule('/src/lib/components/ladders/ladderSettings.ts');
 assert.deepEqual(Object.keys(ladderSettings.ladder_system.values),['win_points','half_rank','the_percent_fixed','static_1']);
 assert.equal(ladderSettingDefaults.cool_period,3);assert.equal(ladderSettings.cool_period.min,1);
 for(const setting of Object.values(ladderSettings)) if(setting.type==='enum') for(const option of Object.values(setting.values)){
  assert.ok(option.label);assert.equal(option.label.includes('_'),false);assert.ok(option.description);
 }
});
