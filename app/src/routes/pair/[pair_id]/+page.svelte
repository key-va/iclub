<script lang="ts">
	import { page } from '$app/state';
	import {
		guids,
		entityOf,
		relationsOf,
		typeOf,
		imageOf
	} from '#lib/stores/guids.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import MatchRecord from '#lib/components/matches/MatchRecord.svelte';
	import MatchHistory from '#lib/components/matches/MatchHistory.svelte';
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
			image={comp ? imageOf(comp.rk) : ladderRow ? imageOf(ladderRow.rk) : null}
		/>
		<MatchRecord parentId={id} />
		{#if comp}
			<UserCompetition user={pair} competition={comp} />
			<MatchHistory parentId={id} />
		{:else}
			<PairLadder {pair} {ladderRow} />
		{/if}
	{:else}<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>{/if}
</div>
