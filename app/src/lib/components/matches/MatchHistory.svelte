<script lang="ts">
	import {
		relationsOf,
		typeOf,
		entityOf,
		nameOf,
		hrefOf
	} from '#lib/stores/guids.ts';
	import { pastMatches, matchSummary } from './matchRules.ts';
	import RouteLink from '../routeLink.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	let {
		parentId,
		title = 'Match History'
	}: { parentId: string; title?: string } = $props();
	const matches = $derived(
		pastMatches(
			relationsOf(parentId).filter(
				(row) => typeOf(row.rk) === 'match' && entityOf(row.rk)
			)
		).sort((a, b) => b.rk.localeCompare(a.rk))
	);
</script>

<HiddenOptions {title}>
	{#each matches as match (match.rk)}<RouteLink
			href={hrefOf(match.rk)}
			title={nameOf(match.rk)}
			description={matchSummary(match.rk)}
		/>{/each}
</HiddenOptions>
