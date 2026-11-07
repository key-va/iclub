<script lang="ts">
    import { page } from '$app/state';
    import { canChallenge as sharedCanChallenge } from '#lib/challenge.ts';
    import { local } from '#lib/stores/local.ts';
    import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
    import { matchSummary, pastMatches } from '#lib/matchSummary.ts';
    import RouteLink from '#lib/components/routeLink.svelte';
    import HiddenOptions from '#lib/components/hiddenOptions.svelte';
    import ApiService from '#lib/components/apiService.svelte';
    const pairId = $derived(page.params.pair_id ?? '');
    const pair = $derived(entityOf($guids.items, pairId));
    const members = $derived(relatedEntities($guids.items, pairId, 'user').filter(user => user.relation.role === 'member'));
    const ladder = $derived(relatedEntities($guids.items, pairId, 'ladder')[0]);
    const retired = $derived(ladder?.relation.is_participant !== true);
    const canRetire = $derived(members.some(user => user.rk === $local.caller_id) || !!ladder && relationsOf($guids.items, ladder.rk).some(row => row.rk === $local.caller_id && row.is_admin === true));
    const matches = $derived(relatedEntities($guids.items, pairId, 'match').sort((a,b) => b.rk.localeCompare(a.rk)));
    const liveMatches = $derived(matches.filter(match => match.state === 'pending' || match.state === 'active'));
    const history = $derived(pastMatches(matches));
    const myPair = $derived(ladder ? relatedEntities($guids.items, ladder.rk, 'pair').find(candidate =>
        candidate.relation.is_participant === true && relatedEntities($guids.items, candidate.rk, 'user').some(member => member.rk === $local.caller_id)
    ) : undefined);
    const canChallenge = $derived(sharedCanChallenge(ladder, myPair?.relation, myPair?.rk ?? null, {
        rk: pairId, rank: Number(ladder?.relation.rank), relation: ladder?.relation ?? {}
    }));
    const stateColours: Record<string, string> = { away: 'red', busy: 'gold', cooling: 'blue', active: 'green' };
    const stateText = $derived(retired ? 'retired' : ladder?.relation.state === 'active' ? 'available' : ladder?.relation.state === 'busy' ? 'in a match' : String(ladder?.relation.state));
</script>
<div class="page">
    {#if pair}
        <div class="row right">
            <p class="truncate"><strong>{pair.name ?? 'Pair'}</strong><br />pair</p>
            <div class="blank-icon-small"></div>
        </div>
        {#if ladder}
            <div class="row center">
                <div class="round-icon-big" style:background-image={`url('${imageOf(ladder.rk)}')`}></div>
            </div>
            <div class="group">
                <RouteLink href={hrefOf(ladder.rk)} title={ladder.name ?? 'Ladder'} description={stateText} image={imageOf(ladder.rk)} isWhite={false}>
                    {#snippet detail()}
                        <span class="dot" style:background={stateColours[String(ladder.relation.state)] ?? 'grey'} role="img" aria-label={stateText}></span>{Number(ladder.relation.rank) || 0}
                    {/snippet}
                </RouteLink>
                {#each liveMatches as match (match.rk)}
                    <RouteLink href={hrefOf(match.rk)} title={match.name ?? 'Match'} description={String(match.state)} isWhite={false} />
                {:else}
                    {#if !retired && myPair?.rk !== pairId}
                        <ApiService name="challenge" message={`challenge ${pair.name ?? 'this pair'}?`} endpoint="match/create" data={{ ladder_id: ladder.rk, challenger_id: myPair?.rk, defender_id: pairId }} disabled={!canChallenge} />
                    {/if}
                {/each}
            </div>
        {/if}
        <HiddenOptions title="Members" badge={members.length} />
        {#each members as member (member.rk)}
            <RouteLink href={hrefOf(member.rk)} title={member.name ?? 'Player'} description="member" image={imageOf(member.rk)} isWhite={false} />
        {/each}
        <div class="group">
            <HiddenOptions title="Match History" badge={history.length} />
            {#each history as match (match.rk)}
                <RouteLink href={hrefOf(match.rk)} title={match.name ?? 'Match'} description={matchSummary($guids.items, match.rk)} />
            {/each}
        </div>
        {#if !retired && canRetire}
            <HiddenOptions title="More Options" description="state">
                <ApiService name="retire pair" message="retire this pair? unresolved matches will be forfeited and both members will return to pending" endpoint={`pair/${pairId}/retire`} />
            </HiddenOptions>
        {/if}
    {:else}
        <HiddenOptions title={$guids.loaded ? 'Not found' : 'Loading'} description="pair" />
    {/if}
</div>

<style>
    .dot {
        display: inline-block;
        width: 0.7em;
        height: 0.7em;
        margin: 0 0.25em;
        border: 2px solid white;
        border-radius: 50%;
    }
</style>
