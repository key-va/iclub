<script lang="ts">
	import { entityOf, relationsOf, typeOf } from '#lib/stores/guids.ts';
	let { parentId }: { parentId: string } = $props();

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

<div class="group">
	<p class="info center description">{results.won} won • lost {results.lost}</p>
</div>
