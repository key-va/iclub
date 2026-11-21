<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, hrefOf, type GuidRow } from '#lib/stores/guids.ts';
	import {
		roundRoleColour,
		availabilityOptions,
		isTeamMember
	} from '#lib/components/rounds/roundRules.ts';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import RouteLink from '../routeLink.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let {
		team,
		round,
		past = false
	}: { team: GuidRow; round: GuidRow; past?: boolean } = $props();
	const mine = $derived(
		relationsOf(team.rk).find((row) => row.rk === $local.caller_id)
	);
	const role = $derived(
		$local.caller_id
			? relationsOf($local.caller_id).find((row) => row.rk === round.rk)?.role
			: undefined
	);
	const roleLabel = $derived(role == null ? 'no status' : String(role));
	const description = $derived(
		round.ext_stage && round.is_home === undefined
			? `${roleLabel} · ${round.date}`
			: `${roleLabel} • ${round.is_home ? 'home' : 'away'} • ${round.date}`
	);
	const options = $derived(
		isTeamMember(mine) && round.state !== 'complete'
			? availabilityOptions(role)
			: []
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
		{#each options as nextRole}<ActionQuick
				inline
				name={nextRole}
				action={() => setRoundRole(round.rk, nextRole)}
			/>{/each}
	{/snippet}
	<RouteLinkHiddenAction
		href={hrefOf(round.rk)}
		title={round.name}
		{description}
		colour={roundRoleColour[String(role)] ?? 'grey'}
		children={options.length ? actions : undefined}
	/>
{/if}
