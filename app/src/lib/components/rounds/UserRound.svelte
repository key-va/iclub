<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		entityOf,
		hrefOf,
		nameOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import {
		roundView,
		roundRoleLabel,
		roundRoleColour,
		isTeamAdmin,
		isTeamMember
	} from './roundRules.ts';
	import RoundQuickOptions from './RoundQuickOptions.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let { user, team, round }: { user: GuidRow; team: GuidRow; round: GuidRow } =
		$props();
	const record = $derived(
		roundView(
			entityOf(round.rk)!,
			relationsOf(team.rk).find((row) => row.rk === round.rk)
		)
	);
	const ownProfile = $derived(user.rk === $local.caller_id);
	const editable = $derived(
		ownProfile && isTeamMember(team) &&
		!['complete', 'eliminated'].includes(String(record.state))
	);
</script>

{#snippet actions()}
	<RoundQuickOptions roundId={round.rk} role={round.role} {editable} admin={isTeamAdmin(team)} />
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(round.rk)}
	title={nameOf(round.rk)}
	description={roundRoleLabel(round.role)}
	colour={roundRoleColour[String(round.role)] ?? 'grey'}
	children={ownProfile ? actions : undefined}
	currentSelection={ownProfile ? undefined : roundRoleLabel(round.role) || 'no actions'}
>
	{#snippet detail()}{record.date}{/snippet}
</RouteLinkHiddenAction>
