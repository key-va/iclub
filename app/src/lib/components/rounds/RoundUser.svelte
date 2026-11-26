<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { roundRoleColour, roundRoleLabel, isTeamAdmin, isTeamMember } from './roundRules.ts';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import RoundQuickOptions from './RoundQuickOptions.svelte';
	let { round, team, user }: { round: GuidRow; team: GuidRow; user: GuidRow } =
		$props();
	const membership = $derived(relationsOf(team.rk).find((row) => row.rk === $local.caller_id));
	const admin = $derived(isTeamAdmin(membership));
	const openRound = $derived(!['complete', 'eliminated'].includes(String(round.state)));
	const canEditOwn = $derived(openRound && user.rk === $local.caller_id && isTeamMember(membership));
	const canManage = $derived(openRound && admin);
</script>

{#snippet rowActions()}
	{#if canEditOwn}
		<RoundQuickOptions roundId={round.rk} role={user.role} editable={true} {admin} />
	{:else}
		<ActionQuick inline name="playing" disabled={user.role !== 'available'}
			action={() => setRoundRole(round.rk, 'selected', user.rk)} />
		<ActionQuick inline name="available" disabled={user.role !== 'selected'}
			action={() => setRoundRole(round.rk, 'available', user.rk)} />
	{/if}
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(user.rk)}
	title={nameOf(user.rk)}
	description={roundRoleLabel(user.role)}
	image={imageOf(user.rk)}
	colour={roundRoleColour[String(user.role)] ?? 'grey'}
	children={canEditOwn || canManage ? rowActions : undefined}
	currentSelection={canEditOwn || canManage ? undefined : 'no actions'}
/>
