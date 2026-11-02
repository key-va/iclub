<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id } = $local;

	const matchId = $derived(page.params.match_id ?? '');
	const match = $derived(entityOf($guids.items, matchId));
	const ladder = $derived(relatedEntities($guids.items, matchId, 'ladder')[0]);
	const players = $derived(relatedEntities($guids.items, matchId, 'user'));
	const challenger = $derived(players.find((player) => player.relation.role === 'challenger'));
	const defender = $derived(players.find((player) => player.relation.role === 'defender'));

	const isLadderAdmin = $derived(
		!!ladder && relationsOf($guids.items, ladder.rk).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const canAccept = $derived(match?.state === 'pending' && (caller_id === defender?.rk || isLadderAdmin));
</script>

<div class="page">
	{#if match}
		<div class="row right">
			<p class="truncate"><strong>{match.name}</strong><br />{match.state}</p>
			<div class="blank-icon-small"></div>
		</div>

		{#if match.state === 'pending'}
			<div class="group">
				<RouteLink hasMoreOptions icon="down_chevron" title="Pending" description="waiting for {defender?.name ?? 'the defender'} to accept">
					<ApiService
						inline
						name="accept"
						message={`accept the challenge from ${challenger?.name ?? 'your opponent'}?`}
						endpoint={`match/${matchId}/accept`}
						disabled={!canAccept}
					/>
				</RouteLink>
			</div>
		{/if}

		<div class="group">
			{#if ladder}
				<RouteLink href={hrefOf(ladder.rk)} title={ladder.name ?? 'no name'} description="ladder" isWhite={false} image={imageOf(ladder.rk)} />
			{/if}
			{#if challenger}
				<RouteLink href={hrefOf(challenger.rk)} title={challenger.name ?? 'no name'} description="challenger" isWhite={false} image={imageOf(challenger.rk)} />
			{/if}
			{#if defender}
				<RouteLink href={hrefOf(defender.rk)} title={defender.name ?? 'no name'} description="defender" isWhite={false} image={imageOf(defender.rk)} />
			{/if}
		</div>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />match</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
