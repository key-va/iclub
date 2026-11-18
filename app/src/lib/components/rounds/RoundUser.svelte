<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { roundRoleColour, isTeamAdmin } from './roundRules.ts';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { round, team, user }: { round: GuidRow; team: GuidRow; user: GuidRow } =
		$props();
	const admin = $derived(
		isTeamAdmin(relationsOf(team.rk).find((row) => row.rk === $local.caller_id))
	);
	const selectable = $derived(
		round.state !== 'complete' &&
			admin &&
			['available', 'selected'].includes(String(user.role))
	);
</script>

{#snippet selectionAction()}
	<ActionQuick
		inline
		name={user.role === 'selected' ? 'available' : 'select'}
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
	description={String(user.role)}
	image={imageOf(user.rk)}
	colour={roundRoleColour[String(user.role)] ?? 'grey'}
	children={selectable ? selectionAction : undefined}
/>
