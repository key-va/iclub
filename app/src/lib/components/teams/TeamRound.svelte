<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, hrefOf, type GuidRow } from '#lib/stores/guids.ts';
	import {
		roundAvailability,
		roundAvailabilityColour,
		futureRoundDescription,
		isTeamMember
	} from '#lib/components/rounds/roundRules.ts';
	import RoundQuickOptions from '../rounds/RoundQuickOptions.svelte';
	import RouteLink from '../routeLink.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let {
		team,
		round,
		past = false,
		featured = false
	}: { team: GuidRow; round: GuidRow; past?: boolean; featured?: boolean } = $props();
	const mine = $derived(
		relationsOf(team.rk).find((row) => row.rk === $local.caller_id)
	);
	const member = $derived(isTeamMember(mine));
	const role = $derived(
		$local.caller_id
			? relationsOf($local.caller_id).find((row) => row.rk === round.rk)?.role
			: undefined
	);
	const counts = $derived(roundAvailability(round.rk));
	const description = $derived(
		featured
			? [
				typeof round.is_home === 'boolean' ? (round.is_home ? 'home' : 'away') : '',
				`${counts.playing} playing`,
				`${counts.available} available`
			].filter(Boolean).join(' • ')
			: futureRoundDescription(round, role)
	);
	const editable = $derived(
		member && !['complete', 'eliminated'].includes(String(round.state))
	);
</script>

{#if past}
	<RouteLink
		href={hrefOf(round.rk)}
		title={round.name}
		description={`${round.result} • ${round.ext_points_for ?? 0} - ${round.ext_points_against ?? 0} points`}
	/>
{:else}
	{#snippet actions()}
		<RoundQuickOptions roundId={round.rk} {role} {editable} />
	{/snippet}
	<RouteLinkHiddenAction
		href={hrefOf(round.rk)}
		title={round.name}
		{description}
		colour={roundAvailabilityColour(counts)}
		isWhite={featured}
		children={actions}
	/>
{/if}
