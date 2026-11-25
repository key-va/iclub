<script lang="ts">
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import ActionLink from '../ActionLink.svelte';
	import { teamDescription, isTeamAdmin } from '../rounds/roundRules.ts';
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinTeam, leaveTeam, activateTeam } from '#lib/stores/remote.ts';
	let {
		team,
		section = 'all'
	}: { team: GuidRow; section?: 'all' | 'primary' | 'options' } = $props();
	const mine = $derived(
		relationsOf(team.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const club = $derived(
		relationsOf(team.rk).find((row) => row.rk.startsWith('club_'))?.rk ?? team.rejection_club
	);
	const clubAdmin = $derived(
		typeof club === 'string' &&
			relationsOf(club).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
</script>

{#snippet membershipOptions()}
	{#if mine && team.state === 'active'}
		<ActionConfirmation inline name="leave team" message={`leave ${team.name}?`}
			action={() => leaveTeam(team.rk)} />
	{/if}
	{#if isTeamAdmin(mine)}
		<ActionLink href={`/team/${team.rk}/edit`} name="edit" />
	{/if}
{/snippet}

<EntityActions
	{section}
	options={team.state === 'active' && mine ? membershipOptions : undefined}
	summary={teamDescription(team)}
>
	{#if team.state === 'rejected'}
		<p class="description">creation request rejected</p>
		{#if clubAdmin && team.rejection_club}<RejectCreationRequest id={team.rk} resuming />{/if}
	{:else if team.state === 'pending' && clubAdmin}
		<RejectCreationRequest id={team.rk} />
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="approve team"
			message={`Approve ${team.name} and import its rounds?`}
			action={() => activateTeam(team.rk)}
		/>
	{:else if team.state === 'active' && (!mine || mine.state === 'pending')}
		<ActionConfirmation inline arrow showLabel name="request to join" message={`request to join ${team.name}?`}
			action={() => joinTeam(team.rk)}
			disabled={!$local.caller_id || mine?.state === 'pending'} />
	{/if}
</EntityActions>
