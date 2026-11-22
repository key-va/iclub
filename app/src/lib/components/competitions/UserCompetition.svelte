<script lang="ts">
	import { entityOf, hrefOf, imageOf, nameOf, type GuidRow } from '#lib/stores/guids.ts';
	import UserMatch from '../matches/UserMatch.svelte';
	import { roundRobinStandings } from './roundRobinStandings.ts';
	import { competitionChampion } from './competitionBracket.ts';
	import HiddenOptions from '../hiddenOptions.svelte';
	import RouteLink from '../routeLink.svelte';
	import { activeCompetitionMatches, competitionPair, competitionPlayerMatches, competitionPlayerStatus } from './competitionPlayers.ts';

	let { user, competition }: { user: GuidRow; competition: GuidRow } = $props();
	const matches = $derived(competitionPlayerMatches(competition.rk, user.rk));
	const active = $derived(activeCompetitionMatches(matches));
	const comp = $derived(entityOf(competition.rk));
	const champion = $derived(comp && comp.comp_system !== 'round_robin' ? competitionChampion(comp) : '');
	const pair = $derived(competitionPair(competition.rk, user.rk));
	const standing = $derived(comp?.comp_system === 'round_robin'
		? roundRobinStandings(competition.rk).find((row) => row.entry.rk === (pair?.rk ?? user.rk))
		: undefined);
	const status = $derived(standing
		? comp?.state === 'complete' && standing.place === 1
			? 'champion'
			: `rank ${standing.place} • ${standing.won} won • ${standing.lost} lost`
		: competitionPlayerStatus(pair ?? competition, matches, champion === (pair?.rk ?? user.rk)));
</script>

<div class="group">
	<RouteLink href={hrefOf(competition.rk)} title={nameOf(competition.rk)}
		description={status} image={imageOf(competition.rk)} />
	{#each active as match (match.rk)}
		<UserMatch {match} />
	{:else}
		<HiddenOptions title="No pending matches" />
	{/each}
</div>
