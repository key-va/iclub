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
	const canManage = $derived(
		admin && !['complete', 'eliminated'].includes(String(round.state))
	);
</script>

{#snippet selectionActions()}
	<ActionQuick inline name="playing" disabled={user.role !== 'available'}
		action={() => setRoundRole(round.rk, 'selected', user.rk)} />
	<ActionQuick inline name="available" disabled={user.role !== 'selected'}
		action={() => setRoundRole(round.rk, 'available', user.rk)} />
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(user.rk)}
	title={nameOf(user.rk)}
	description={roundRoleLabel(user.role)}
	image={imageOf(user.rk)}
	colour={roundRoleColour[String(user.role)] ?? 'grey'}
	children={canManage ? selectionActions : undefined}
	currentSelection={canManage ? undefined : 'no actions'}
/>
