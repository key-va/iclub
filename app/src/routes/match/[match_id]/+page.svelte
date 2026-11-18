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
	import MatchContest from '#lib/components/matches/MatchContest.svelte';
	const id = $derived(page.params.match_id ?? '');
	const match = $derived(entityOf(id));
	const ladderRow = $derived(
		relationsOf(id).find((row) => typeOf(row.rk) === 'ladder')
	);
	const ladder = $derived(ladderRow ? entityOf(ladderRow.rk) : undefined);
</script>

<div class="page">
	{#if match}
		<EntityHeader
			entity={match}
			subtitle={match.state}
			image={ladder ? imageOf(ladder.rk) : null}
		/>
		<MatchContest {match} {ladder} />
	{:else}<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>{/if}
</div>
