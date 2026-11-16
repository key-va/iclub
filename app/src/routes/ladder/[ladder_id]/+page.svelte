<script lang="ts">
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, nameOf, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import LadderUser from '#lib/components/ladders/LadderUser.svelte';
	import LadderPair from '#lib/components/ladders/LadderPair.svelte';
	import LadderRequests from '#lib/components/ladders/LadderRequests.svelte';
	import { matchSummary, pastMatches } from '#lib/matchSummary.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const caller_id = $derived($local.caller_id);

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	// Singles list users; doubles list pairs. Competitive rank belongs to the ladder relation.
	const leaderboard = $derived(
		relatedEntities($guids.items, ladderId, ladder?.format === 'doubles' ? 'pair' : 'user')
			.filter((user) => user.relation.is_participant === true)
			.sort((a, b) => Number(a.relation.rank) - Number(b.relation.rank))
	);

	const clubId = $derived(relatedEntities($guids.items, ladderId, 'club')[0]?.rk ?? '');
	const isClubAdmin = $derived(
		relationsOf($guids.items, clubId).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const myRelation = $derived(
		relatedEntities($guids.items, ladderId, 'user').find((user) => user.rk === caller_id)?.relation
	);

	// Players who asked to join and are waiting for a ladder admin to accept
	const pending = $derived(
		relatedEntities($guids.items, ladderId, 'user').filter((user) => user.relation.state === 'pending')
	);
	const isPending = $derived(pending.some((user) => user.rk === caller_id));
	const ongoingMatches = $derived(
		relatedEntities($guids.items, ladderId, 'match').filter(
			(match) => match.state === 'pending' || match.state === 'active'
		)
	);

	// The caller's matches on this ladder that are still pending or active
	const yourMatches = $derived(
		ongoingMatches.filter(
			(match) => relatedEntities($guids.items, match.rk, 'user').some((user) => user.rk === caller_id)
		)
	);

	// Finished matches on this ladder, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(relatedEntities($guids.items, ladderId, 'match')).sort((a, b) => b.rk.localeCompare(a.rk))
	);

</script>

<div class="page">
	{#if ladder}
		
		<EntityHeader entity={ladder} />

		{#if ladder.state === 'pending'}
			<div class="group">
				<HiddenOptions inline title="Pending" description="pending approval">
					<ApiService
						inline
						name="accept"
						message={`approve the ladder ${ladder.name} to make it active?`}
						endpoint={`ladder/${ladderId}/activate`}
						disabled={!isClubAdmin}
					/>
				</HiddenOptions>
			</div>
		{/if}

		<LadderRequests {ladder} />

		<div class="group">

		{#if isPending}
            <RouteLink title={nameOf($guids.items, caller_id ?? '')} description="waiting to join" href={hrefOf(caller_id ?? '')} image={imageOf(caller_id ?? '')} />
        {/if}

		{#if yourMatches.length > 0}
			{#each yourMatches as match (match.rk)}
				<RouteLink href={hrefOf(match.rk)} title={match.name ?? 'Match'} description={String(match.state) + ' match'} />
			{/each}
        {/if}

		{#if ladder.state === 'active' && myRelation?.is_participant !== true && !isPending}
				<ApiService name="join request" message={`join the ladder ${ladder.name}?`} endpoint={`ladder/${ladderId}/join`} disabled={!caller_id} />
		{/if}

		<HiddenOptions title="Leaderboard" badge={leaderboard.length}>
		</HiddenOptions>
		
		{#each leaderboard as player (player.rk)}
			{#if ladder.format === 'doubles'}
				<LadderPair {ladder} pair={player} />
			{:else}
				<LadderUser {ladder} user={player} />
			{/if}
		{/each}
		</div>
        
		<HiddenOptions title="Ongoing Matches">
			{#each ongoingMatches as match (match.rk)}
				<RouteLink href={hrefOf(match.rk)} title={match.name ?? 'no name'} description={String(match.state) + ' match'} />
			{/each}
		</HiddenOptions>

        <HiddenOptions title="Completed Matches">
			{#each history as match (match.rk)}
				<RouteLink href={hrefOf(match.rk)} title={match.name ?? 'no name'} description={matchSummary($guids.items, match.rk)} />
			{/each}
			</HiddenOptions>
		
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />ladder</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
