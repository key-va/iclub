import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_PREFIX = 'iclub-test';
let server, summary, challenge, branding;
before(async () => {
    server = await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},logLevel:'error',optimizeDeps:{noDiscovery:true}});
    branding = await server.ssrLoadModule('/src/lib/stores/branding.ts');
    summary = await server.ssrLoadModule('/src/lib/matchSummary.ts');
    challenge = await server.ssrLoadModule('/src/lib/challenge.ts');
});
after(async () => { await server?.close(); });

test('doubles match summaries use pair outcomes rather than duplicated participant outcomes',()=>{
    const items=[
        {pk:'pair',rk:'pair_one',name:'A and B'},{pk:'pair',rk:'pair_two',name:'C and D'},
        {pk:'user',rk:'user_a',name:'A'},{pk:'user',rk:'user_c',name:'C'},
        {pk:'match_test',rk:'pair_one',role:'challenger',result:'winner',score:'6,7'},
        {pk:'match_test',rk:'pair_two',role:'defender',result:'loser',score:'2,5'},
        {pk:'match_test',rk:'user_a',role:'participant',result:'winner',score:'6,7'},
        {pk:'match_test',rk:'user_c',role:'participant',result:'loser',score:'2,5'}
    ];
    assert.equal(summary.matchSummary(items,'match_test'),'A and B wins 6-2 7-5');
    items[5].result='forfeiter';assert.equal(summary.matchSummary(items,'match_test'),'A and B wins by forfeit 6-2 7-5');
});

test('singles summaries and completed history filtering remain unchanged',()=>{
    const items=[{pk:'user',rk:'user_a',name:'A'},{pk:'user',rk:'user_b',name:'B'},
        {pk:'match_test',rk:'user_a',role:'challenger',result:'winner',score:6},
        {pk:'match_test',rk:'user_b',role:'defender',result:'loser',score:2}];
    assert.equal(summary.matchSummary(items,'match_test'),'A wins 6-2');
    assert.equal(summary.pastMatches([{state:'pending'},{state:'active'},{state:'complete'}]).length,1);
});

test('challenge controls work for pair and user competitors across rank, reach and state rules',()=>{
    for(const prefix of ['pair','user']){
        const me={is_participant:true,rank:4,points:3,state:'active'};
        const target={rk:`${prefix}_other`,rank:2,relation:{is_participant:true,state:'cooling'}};
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},me,`${prefix}_me`,target),true);
        assert.equal(challenge.canChallenge({ladder_system:'half_rank'},me,`${prefix}_me`,target),true);
        assert.equal(challenge.canChallenge({ladder_system:'static_range_1'},me,`${prefix}_me`,target),false);
        assert.equal(challenge.canChallenge({ladder_system:'static_range_3'},me,`${prefix}_me`,target),true);
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},{...me,state:'busy'},`${prefix}_me`,target),false);
        assert.equal(challenge.canChallenge({ladder_system:'win_points'},me,target.rk,target),false);
    }
});


test('hostname selects branding without user/club relations, with safe fallback colours',()=>{
 const rows=[{pk:'club',rk:'club_c',name:'Intra Club',url:'app.intra.club',foreground:'#FF1493',background:'#00BFFF'},
  {pk:'club',rk:'club_n',name:'Next Club',url:'next.intra.club',foreground:'#00BFFF',background:'#B67233'}];
 const next=branding.brandingForHost(rows,'next.intra.club');
 assert.equal(next.name,'Next Club');assert.equal(next.foreground,'#00BFFF');assert.equal(next.background,'#B67233');assert.match(next.icon,/club_n\.jpg$/);
 assert.equal(branding.brandingForHost(rows,'APP.INTRA.CLUB').name,'Intra Club');
 assert.equal(branding.brandingForHost(rows,'localhost').clubId,null);
 rows[1].foreground='url(https://bad.example)';assert.equal(branding.brandingForHost(rows,'next.intra.club').foreground,'#FF1493');
});
