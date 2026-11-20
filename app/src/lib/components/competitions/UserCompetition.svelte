<script lang="ts">
	import { hrefOf, imageOf, nameOf, type GuidRow } from '#lib/stores/guids.ts';
	import UserMatch from '../matches/UserMatch.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import RouteLink from '../routeLink.svelte';
	import { activeCompetitionMatches, competitionPlayerMatches, competitionPlayerStatus } from './competitionPlayers.ts';

	let { user, competition }: { user: GuidRow; competition: GuidRow } = $props();
	const matches = $derived(competitionPlayerMatches(competition.rk, user.rk));
	const active = $derived(activeCompetitionMatches(matches));
	const status = $derived(competitionPlayerStatus(competition, matches));
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
