<script lang="ts">
	import { page } from '$app/state';
	import {
		guids,
		entityOf,
		relationsOf,
		typeOf,
		nameOf, hrefOf, imageOf
	} from '#lib/stores/guids.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import UserCompetition from '#lib/components/competitions/UserCompetition.svelte';
	import PairLadder from '#lib/components/pairs/PairLadder.svelte';
	const id = $derived(page.params.pair_id ?? '');
	const pair = $derived(entityOf(id));
	const comp = $derived(relationsOf(id).find((row) => typeOf(row.rk) === 'comp'));
	const ladderRow = $derived(
		relationsOf(id).find((row) => typeOf(row.rk) === 'ladder')
	);
</script>

<div class="page">
	{#if pair}
		<EntityHeader
			entity={pair}
			title={pair.name ?? 'Pair'}
			image={ladderRow ? imageOf(ladderRow.rk) : null}
		/>
		{#if comp}
			<div class="group">
				{#each relationsOf(id).filter((row) => typeOf(row.rk) === 'user' && row.role === 'member') as member (member.rk)}
					<RouteLink href={hrefOf(member.rk)} title={nameOf(member.rk)} image={imageOf(member.rk)} />
				{/each}
			</div>
			<UserCompetition user={pair} competition={comp} />
		{:else}
			<PairLadder {pair} {ladderRow} />
		{/if}
	{:else}<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>{/if}
</div>
