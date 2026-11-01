<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import { ladderSettings } from '#lib/strings.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id } = $local;

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	// Participants are the users flagged is_participant on their ladder relation, best (lowest) rank first
	const leaderboard = $derived(
		relatedEntities($guids.items, ladderId, 'user')
			.filter((user) => user.relation.is_participant === true)
			.map((user) => ({ ...user, rank: Number(user.relation.rank) }))
			.sort((a, b) => a.rank - b.rank)
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
	const isLadderAdmin = $derived(
		relationsOf($guids.items, ladderId).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);

	let showHelp = $state(false);
</script>

<div class="page">
	{#if ladder}
		<div class="row right">
			<p class="truncate"><strong>{ladder.name}</strong><br />{ladder.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{ladder.rk}.jpg');"></div>
		</div>

		<div class="group">
			{#each leaderboard as player (player.rk)}
				<RouteLink
					href={hrefOf(player.rk)}
					title={player.name ?? 'no name'}
					description={`rank ${player.rank}`}
					isWhite={false}
					image={imageOf(player.rk)}
				/>
			{:else}
				<div class="row right">
					<p class="truncate"><strong>No participants</strong><br />leaderboard</p>
					<div class="blank-icon-small"></div>
				</div>
			{/each}
		</div>

		{#if isLadderAdmin && pending.length > 0}
			<div class="group">
				{#each pending as player (player.rk)}
					<RouteLink
						hasMoreOptions
						href={hrefOf(player.rk)}
						title={player.name ?? 'no name'}
						description="waiting to join"
						image={imageOf(player.rk)}
					>
						<ApiService
							inline
							name="accept"
							message={`accept ${player.name ?? 'this player'} onto the ladder?`}
							endpoint={`ladder/${ladderId}/accept`}
							data={{ user_id: player.rk }}
						/>
					</RouteLink>
				{/each}
			</div>
		{/if}

		{#if ladder.state === 'pending' && isClubAdmin}
			<ApiService
				name="accept"
				message={`accept the ladder ${ladder.name} and make it active?`}
				endpoint={`ladder/${ladderId}/activate`}
			/>
		{:else if ladder.state === 'active' && myRelation?.is_participant !== true && !isPending}
			<ApiService name="join" message={`join the ladder ${ladder.name}?`} endpoint={`ladder/${ladderId}/join`} disabled={!caller_id} />
		{/if}
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
