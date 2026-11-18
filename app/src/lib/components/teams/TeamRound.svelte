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
		description={round.result +
			' ' +
			(round.ext_points_for ? ` ${round.ext_points_for}` : '0') +
			' - ' +
			(round.ext_points_against ? ` ${round.ext_points_against} ` : '0') +
			' points'}
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
		description={role == null ? 'no status' : String(role)}
		colour={roundRoleColour[String(role)] ?? 'grey'}
		children={options.length ? actions : undefined}
	>
		{#snippet detail()}{round.is_home ? 'home' : 'away'} {round.date}{/snippet}
	</RouteLinkHiddenAction>
{/if}
