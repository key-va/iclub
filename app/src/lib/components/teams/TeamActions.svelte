<script lang="ts">
	import ActionLink from '../ActionLink.svelte';
	import { teamDescription, isTeamAdmin } from '../rounds/roundRules.ts';
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinTeam, leaveTeam, activateTeam } from '#lib/stores/remote.ts';
	let { team }: { team: GuidRow } = $props();
	const mine = $derived(
		relationsOf(team.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const club = $derived(
		relationsOf(team.rk).find((row) => row.rk.startsWith('club_'))
	);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
</script>

{#snippet editOption()}<ActionLink
		href={`/team/${team.rk}/edit`}
		name="edit"
	/>{/snippet}

<EntityActions
	options={isTeamAdmin(mine) ? editOption : undefined}
	summary={teamDescription(team)}
	more={team.state === 'active' && !!mine}
>
	{#if team.state === 'pending'}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="approve team"
			message={`Approve ${team.name} and import its rounds?`}
			action={() => activateTeam(team.rk)}
			disabled={!clubAdmin}
		/>
	{:else if team.state === 'active'}
		{#if mine}<ActionConfirmation
				inline
				arrow
				showLabel
				name="leave team"
				message="Leave this team?"
				action={() => leaveTeam(team.rk)}
			/>
		{:else}<ActionConfirmation
				inline
				arrow
				showLabel
				name="request to join"
				action={() => joinTeam(team.rk)}
				disabled={!$local.caller_id}
			/>{/if}
	{/if}
</EntityActions>
