<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		entityOf,
		hrefOf,
		nameOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import {
		roundView,
		availabilityOptions,
		roundRoleColour,
		isTeamMember
	} from './roundRules.ts';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { user, team, round }: { user: GuidRow; team: GuidRow; round: GuidRow } =
		$props();
	const record = $derived(
		roundView(
			entityOf(round.rk)!,
			relationsOf(team.rk).find((row) => row.rk === round.rk)
		)
	);
	const options = $derived(
		user.rk === $local.caller_id &&
			isTeamMember(team) &&
			!['complete', 'eliminated'].includes(String(record.state))
			? availabilityOptions(round.role)
			: []
	);
</script>

{#snippet actions()}
	{#each options as role}<ActionQuick
			inline
			name={role}
			action={() => setRoundRole(round.rk, role)}
		/>{/each}
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(round.rk)}
	title={nameOf(round.rk)}
	description={String(round.role)}
	colour={roundRoleColour[String(round.role)] ?? 'grey'}
	children={options.length ? actions : undefined}
>
	{#snippet detail()}{record.date}{/snippet}
</RouteLinkHiddenAction>
