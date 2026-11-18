<script lang="ts">
	import RoundSummary from '#lib/components/rounds/RoundSummary.svelte';
	import RoundUser from '#lib/components/rounds/RoundUser.svelte';
	import MessageThread from '#lib/components/messages/MessageThread.svelte';

	import { page } from '$app/state';
	import { roundView } from '#lib/components/rounds/roundRules.ts';

	import {
		guids,
		entityOf,
		hrefOf,
		imageOf,
		relationsOf,
		typeOf,
		nameOf
	} from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.round_id ?? '');
	const roundEntity = $derived(entityOf(id));
	const team = $derived(
		relationsOf(id).filter(
			(row) => typeOf(row.rk) === 'team' && entityOf(row.rk)
		)[0]
	);
	const round = $derived(
		roundEntity ? roundView(roundEntity, team) : undefined
	);
	const players = $derived(
		relationsOf(id).filter(
			(row) => typeOf(row.rk) === 'user' && entityOf(row.rk)
		)
	);
</script>

<div class="page">
	{#if round && team}
		<EntityHeader entity={round} image={imageOf(team.rk)} />
		<RoundSummary {round} {team} />

		<div class="group">
			<RouteLink
				href={hrefOf(team.rk)}
				title={nameOf(team.rk)}
				image={imageOf(team.rk)}
			/>
			{#each players as player (player.rk)}
				<RoundUser {round} {team} user={player} />
			{/each}
		</div>

		<MessageThread parentId={id} />
	{:else}<div class="row right">
			<p>{$guids.loaded ? 'Round not found' : 'Loading…'}</p>
		</div>{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
