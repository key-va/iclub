<script lang="ts">
    import { page } from '$app/state';
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
</script>
<div class="page">
    {#if pair}
        <HiddenOptions title={pair.name ?? 'Pair'} description={retired ? 'retired' : `rank ${ladder?.relation.rank} · ${ladder?.relation.points ?? 0} points · ${ladder?.relation.state}`} />
        <div class="group">
            <HiddenOptions title="Members" description="Equal members; membership is permanent for this pair" />
            {#each members as member (member.rk)}
                <RouteLink href={hrefOf(member.rk)} title={member.name ?? 'Player'} description="member" image={imageOf(member.rk)} />
            {/each}
        </div>
        {#if ladder}
            <RouteLink href={hrefOf(ladder.rk)} title={ladder.name ?? 'Ladder'} description="ladder" image={imageOf(ladder.rk)} />
        {/if}
        <div class="group">
            <HiddenOptions title="Matches" badge={matches.length} />
            {#each matches as match (match.rk)}
                <RouteLink href={hrefOf(match.rk)} title={match.name ?? 'Match'} description={pastMatches([match]).length ? matchSummary($guids.items, match.rk) : String(match.state)} />
            {/each}
        </div>
        {#if !retired && canRetire}
            <ApiService name="retire pair" message="retire this pair? unresolved matches will be forfeited and both members will return to pending" endpoint={`pair/${pairId}/retire`} />
        {/if}
    {:else}
        <HiddenOptions title={$guids.loaded ? 'Not found' : 'Loading'} description="pair" />
    {/if}
</div>
