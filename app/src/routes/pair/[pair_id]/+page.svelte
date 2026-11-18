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
	import PairLadder from '#lib/components/pairs/PairLadder.svelte';
	const id = $derived(page.params.pair_id ?? '');
	const pair = $derived(entityOf(id));
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
		<PairLadder {pair} {ladderRow} />
	{:else}<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>{/if}
</div>
