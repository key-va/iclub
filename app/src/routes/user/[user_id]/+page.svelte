<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
	import ApiService from '#lib/components/apiService.svelte';
	import { canChallenge as sharedCanChallenge } from '#lib/challenge.ts';

	const { caller_id, device_id } = $local;

	const user_id = $derived(page.params.user_id ?? '');
	const user_entity = $derived(entityOf($guids.items, user_id));

	// Ladders this user is associated with, carrying their rank (if any) from the relation
	const ladders = $derived(
		relatedEntities($guids.items, user_id, 'ladder').map((ladder) => ({
			...ladder,
			rank: Number(ladder.relation.rank)
		}))
	);
	// Matches still in play 	(pending or active) that this user is part of
	const liveMatches = $derived(
			relatedEntities($guids.items, user_id, 'match').filter((match) => match.state === 'pending' || match.state === 'active')
	);
	const matchesOf = (ladderId: string) =>
		liveMatches.filter((match) => relatedEntities($guids.items, match.rk, 'ladder').some((ladder) => ladder.rk === ladderId));

	// Whether the caller may challenge the viewed user on this ladder
	function canChallenge(ladder: { rank: number; relation: Record<string, unknown> }, ladderId: string) {
		const me = relatedEntities($guids.items, ladderId, 'user').find((user) => user.rk === caller_id)?.relation;
		return sharedCanChallenge(entityOf($guids.items, ladderId), me, caller_id, {
			rk: user_id,
			rank: ladder.rank,
			relation: ladder.relation
		});
	}
</script>

<div class="page">
	{#if user_entity}
		<div class="row right">
			<p class="truncate"><strong>{user_entity.name}</strong><br />{user_entity.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{user_entity.rk}.jpg');"></div>
		</div>
		
		{#each ladders as ladder (ladder.rk)}
			<div class="group">
				<RouteLink
					href={hrefOf(ladder.rk)}
					title={ladder.name ?? 'no name'}
					description={matchesOf(ladder.rk).length > 0 ? `${matchesOf(ladder.rk).length} pending matches` : 'no pending matches'}
					isWhite={false}
					image={imageOf(ladder.rk)}
				/>
				{#each matchesOf(ladder.rk) as match (match.rk)}
					<RouteLink
						href={hrefOf(match.rk)}
						title={match.name ?? 'no name'}
						description={String(match.state)}
						isWhite={false}
					/>
				{:else}
					{#if user_id !== caller_id}
						<ApiService
							name="challenge"
							message={`challenge ${user_entity.name ?? 'this player'}?`}
							endpoint="match/create"
							data={{ ladder_id: ladder.rk, challenger_id: caller_id, defender_id: user_id }}
							disabled={!canChallenge(ladder, ladder.rk)}
						/>
					{/if}
				{/each}
			</div>
		{:else}
			<RouteLink
				href="/browse"
				title="No Ladders"
				description="browse and join a ladder"
			/>
		{/each}

	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />user</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
