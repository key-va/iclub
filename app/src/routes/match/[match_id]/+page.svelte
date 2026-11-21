<script lang="ts">
	import { page } from '$app/state';
	import {
		guids,
		entityOf,
		relationsOf,
		typeOf,
		imageOf
	} from '#lib/stores/guids.ts';
	import { competitionSlots } from '#lib/components/competitions/competitionBracket.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import MatchContest from '#lib/components/matches/MatchContest.svelte';
	const id = $derived(page.params.match_id ?? '');
	const match = $derived(entityOf(id));
	const ladderRow = $derived(
		relationsOf(id).find((row) => typeOf(row.rk) === 'ladder')
	);
	const ladder = $derived(ladderRow ? entityOf(ladderRow.rk) : undefined);
	const elimLink = $derived(relationsOf(id).find((row) => typeOf(row.rk) === 'comp'));
	const elim = $derived(elimLink ? entityOf(elimLink.rk) : undefined);
</script>

<div class="page">
	{#if match}
		<EntityHeader
			entity={match}
			image={elim ? imageOf(elim.rk) : ladder ? imageOf(ladder.rk) : null}
		/>
		{#if !elim || elim.state === 'active' || elim.state === 'complete'}
			{#key elim ? `${match.rk}:${competitionSlots(match).map((player) => player?.rk ?? '').join(':')}` : match.rk}
				<MatchContest {match} {ladder} {elim} />
			{/key}
		{:else}
			<p>The draw is being prepared.</p>
		{/if}
	{:else}<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>{/if}
</div>
