<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { roundRoleColour, roundRoleLabel, isTeamAdmin } from './roundRules.ts';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { round, team, user }: { round: GuidRow; team: GuidRow; user: GuidRow } =
		$props();
	const admin = $derived(
		isTeamAdmin(relationsOf(team.rk).find((row) => row.rk === $local.caller_id))
	);
	const selectable = $derived(
		!['complete', 'eliminated'].includes(String(round.state)) &&
			admin &&
			['available', 'selected'].includes(String(user.role))
	);
</script>

{#snippet selectionAction()}
	<ActionQuick
		inline
		name={user.role === 'selected' ? 'available' : 'nominate'}
		action={() =>
			setRoundRole(
				round.rk,
				user.role === 'selected' ? 'available' : 'selected',
				user.rk
			)}
	/>
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(user.rk)}
	title={nameOf(user.rk)}
	description={roundRoleLabel(user.role)}
	image={imageOf(user.rk)}
	colour={roundRoleColour[String(user.role)] ?? 'grey'}
	children={selectable ? selectionAction : undefined}
	currentSelection={!selectable ? roundRoleLabel(user.role) : undefined}
/>
