<script lang="ts">
	import type { Snippet } from 'svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { entityOf, relationsOf, typeOf } from '#lib/stores/guids.ts';
	let { parentId, help }: { parentId: string; help?: Snippet } = $props();

	const results = $derived.by(() => {
		let won = 0;
		let lost = 0;
		for (const match of relationsOf(parentId)) {
			if (match.state === 'left' || typeOf(match.rk) !== 'match' || entityOf(match.rk)?.state !== 'complete') continue;
			if (match.result === 'winner') won++;
			if (['loser', 'forfeiter', 'walkover'].includes(String(match.result))) lost++;
		}
		return { won, lost };
	});
</script>

<SummaryHelp {help}>
	<p class="info center description">{results.won} won • lost {results.lost}</p>
</SummaryHelp>
