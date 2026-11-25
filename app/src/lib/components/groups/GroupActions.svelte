<script lang="ts">
	import ActionQuick from '../ActionQuick.svelte';
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import ActionLink from '../ActionLink.svelte';
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinGroup, leaveGroup, activateGroup } from '#lib/stores/remote.ts';
	let {
		group,
		section = 'all'
	}: { group: GuidRow; section?: 'all' | 'primary' | 'options' } = $props();
	const mine = $derived(
		relationsOf(group.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const club = $derived(
		relationsOf(group.rk).find((row) => row.rk.startsWith('club_'))?.rk ?? group.rejection_club
	);
	const clubAdmin = $derived(
		typeof club === 'string' &&
			relationsOf(club).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
</script>

{#snippet membershipOptions()}
	{#if mine && group.state === 'active'}
		<ActionConfirmation inline name="leave group" message={`Leave ${group.name}?`}
			action={() => leaveGroup(group.rk)} />
	{/if}
	{#if mine?.is_admin === true}
		<ActionLink href={`/group/${group.rk}/edit`} name="edit" />
	{/if}
{/snippet}

<EntityActions
	{section}
	options={(group.state === 'active' && mine) || mine?.is_admin === true ? membershipOptions : undefined}
>
	{#if group.state === 'rejected'}
		<p class="description">creation request rejected</p>
		{#if clubAdmin && group.rejection_club}<RejectCreationRequest id={group.rk} resuming />{/if}
	{:else if group.state === 'pending' && clubAdmin}
		<RejectCreationRequest id={group.rk} />
		<ActionQuick
			inline
			arrow
			showLabel
			name="approve group"
			action={() => activateGroup(group.rk)}
		/>
	{:else if group.state === 'active' && (!mine || mine.state === 'pending')}
		<ActionConfirmation inline arrow showLabel name="request to join" message={`request to join ${group.name}?`}
			action={() => joinGroup(group.rk)}
			disabled={!$local.caller_id || mine?.state === 'pending'} />
	{/if}
</EntityActions>
