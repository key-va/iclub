<script lang="ts">
	import { entityOf, hrefOf, imageOf, nameOf, type GuidRow } from '#lib/stores/guids.ts';
	import HiddenOptions from '../hiddenOptions.svelte';
	import RouteLink from '../routeLink.svelte';
	import { competitionPlayerMatches, competitionPlayerStatus } from './competitionPlayers.ts';

	let { user, competition }: { user: GuidRow; competition: GuidRow } = $props();
	const matches = $derived(competitionPlayerMatches(competition.rk, user.rk));
	const active = $derived(matches
		.map((row) => entityOf(row.rk))
		.filter((match): match is GuidRow => match?.state === 'active'));
	const status = $derived(competitionPlayerStatus(competition, matches));
</script>

<div class="group">
	<RouteLink href={hrefOf(competition.rk)} title={nameOf(competition.rk)}
		description={status} image={imageOf(competition.rk)} />
	{#each active as match (match.rk)}
		<RouteLink href={hrefOf(match.rk)} title={match.name} description="active match" />
	{:else}
		<HiddenOptions title="No pending matches" />
	{/each}
</div>
