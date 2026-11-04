<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
    import ApiService from '#lib/components/apiService.svelte';

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
					isWhite={false}
					image={imageOf(ladder.rk)}
				/>
				{#each matchesOf(ladder.rk) as match (match.rk)}
					<RouteLink
						href={hrefOf(match.rk)}
						title={match.name ?? 'no name'}
						description={match.state === 'pending' ? 'waiting to be accepted' : 'accepted, ready to play'}
						isWhite={false}
					/>
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
