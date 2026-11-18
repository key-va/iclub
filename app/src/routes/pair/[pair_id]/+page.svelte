<script lang="ts">
	import EntityHeader from '#lib/components/EntityHeader.svelte';
    import { page } from '$app/state';
    import { canChallenge as sharedCanChallenge, ladderMembership } from '#lib/components/ladders/ladderRules.ts';
    import { local } from '#lib/stores/local.ts';
    import { guids, entityOf, relationsOf, hrefOf, imageOf, typeOf, nameOf } from '#lib/stores/guids.ts';
    import { matchSummary, pastMatches } from '#lib/matchSummary.ts';
    import RouteLink from '#lib/components/routeLink.svelte';
    import HiddenOptions from '#lib/components/hiddenOptions.svelte';
    import ApiService from '#lib/components/apiService.svelte';
    const pairId = $derived(page.params.pair_id ?? '');
    const pair = $derived(entityOf(pairId));
    const members = $derived(relationsOf(pairId).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).filter(user => user.role === 'member'));
    const ladderRow = $derived(relationsOf(pairId).find(row => typeOf(row.rk) === 'ladder'));
    const ladder = $derived(ladderRow ? entityOf(ladderRow.rk) : undefined);
    const retired = $derived(ladderRow?.is_participant !== true);
    const canRetire = $derived(members.some(user => user.rk === $local.caller_id) || !!ladder && relationsOf(ladder.rk).some(row => row.rk === $local.caller_id && row.is_admin === true));
    const matches = $derived(relationsOf(pairId).filter(row => typeOf(row.rk) === 'match' && entityOf(row.rk)).sort((a,b) => b.rk.localeCompare(a.rk)));
    const liveMatches = $derived(matches.filter(match => entityOf(match.rk)?.state === 'pending' || entityOf(match.rk)?.state === 'active'));
    const history = $derived(pastMatches(matches));
    const myPair = $derived(ladder ? ladderMembership(ladder, $local.caller_id).pair : undefined);
    const canChallenge = $derived(sharedCanChallenge(ladder, myPair, myPair?.rk ?? null, {
        rk: pairId, rank: Number(ladderRow?.rank), relation: ladderRow ?? {}
    }));
    const stateColours: Record<string, string> = { away: 'red', busy: 'gold', cooling: 'blue', active: 'green' };
    const stateText = $derived(retired ? 'retired' : ladderRow?.state === 'active' ? 'available' : ladderRow?.state === 'busy' ? 'in a match' : String(ladderRow?.state));
</script>
<div class="page">
    {#if pair}
        <EntityHeader entity={pair} title={pair.name ?? 'Pair'} image={ladder ? imageOf(ladder.rk) : null} />

        {#if ladder}
            <div class="group">
                {#each members as member (member.rk)}
                    <RouteLink href={hrefOf(member.rk)} title={nameOf(member.rk)} description="member" image={imageOf(member.rk)} isWhite={false} />
                {/each}
                <RouteLink href={hrefOf(ladder.rk)} title={ladder.name ?? 'Ladder'} description={stateText} image={imageOf(ladder.rk)} isWhite={false}>
                    {#snippet detail()}
                        <span class="dot" style:background={stateColours[String(ladderRow!.state)] ?? 'grey'} role="img" aria-label={stateText}></span>{Number(ladderRow!.rank) || 0}
                    {/snippet}
                </RouteLink>
                {#each liveMatches as match (match.rk)}
                    <RouteLink href={hrefOf(match.rk)} title={nameOf(match.rk)} description={String(entityOf(match.rk)?.state)} isWhite={false} />
                {:else}
                    {#if !retired && myPair?.rk !== pairId}
                        <ApiService name="challenge" message={`challenge ${pair.name ?? 'this pair'}?`} endpoint="match/create" data={{ ladder_id: ladder.rk, challenger_id: myPair?.rk, defender_id: pairId }} disabled={!canChallenge} />
                    {/if}
                {/each}
            </div>
        {/if}
        
        <HiddenOptions title="Match History">
            {#each history as match (match.rk)}
                <RouteLink href={hrefOf(match.rk)} title={nameOf(match.rk)} description={matchSummary(match.rk)} />
            {/each}
        </HiddenOptions>
        {#if !retired && canRetire}
            <HiddenOptions inline title="More Options" description="retire partnership">
                <ApiService 
                    inline 
                    name="retire" 
                    message="Forfeit all ongoing matches and retire this pair?" 
                    endpoint={`pair/${pairId}/retire`} />
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
