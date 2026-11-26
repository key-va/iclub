<script lang="ts">
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import ActionLink from '../ActionLink.svelte';
	import EntityActions from '../EntityActions.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinGroup, leaveGroup, activateGroup } from '#lib/stores/remote.ts';
	let {
		group,
		adminOnly = false
	}: { group: GuidRow; adminOnly?: boolean } = $props();
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
{/snippet}

{#if adminOnly}
	{#if (mine?.is_admin === true) || (clubAdmin && (group.state === 'pending' || (group.state === 'rejected' && group.rejection_club)))}
		<HiddenOptions inline title="Admin Options">
			{#if clubAdmin && group.state === 'pending'}
				<RejectCreationRequest id={group.rk} />
				<ActionConfirmation
					inline
					arrow
					showLabel
					name="approve group"
					message={`Approve ${group.name}?`}
					action={() => activateGroup(group.rk)}
				/>
			{:else if clubAdmin && group.state === 'rejected' && group.rejection_club}
				<RejectCreationRequest id={group.rk} resuming />
			{/if}
			{#if mine?.is_admin === true}<ActionLink href={`/group/${group.rk}/edit`} />{/if}
		</HiddenOptions>
	{/if}
{:else}
	<EntityActions
		moreOptions={group.state === 'active' && mine ? membershipOptions : undefined}
	>
		{#snippet help()}<p class="info">Use the group chat to arrange social hits and club activities.</p>{/snippet}
		{#if group.state === 'rejected'}
			<p class="description">creation request rejected</p>
		{:else if group.state === 'active' && (!mine || mine.state === 'pending')}
			<ActionConfirmation inline arrow showLabel name="request to join" message={`request to join ${group.name}?`}
				action={() => joinGroup(group.rk)}
				disabled={!$local.caller_id || mine?.state === 'pending'} />
		{/if}
	</EntityActions>
{/if}
