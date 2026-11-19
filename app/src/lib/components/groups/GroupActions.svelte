<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinGroup, leaveGroup, activateGroup } from '#lib/stores/remote.ts';
	let { group }: { group: GuidRow } = $props();
	const mine = $derived(
		relationsOf(group.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const club = $derived(
		relationsOf(group.rk).find((row) => row.rk.startsWith('club_'))
	);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
</script>

<EntityActions more={group.state === 'active' && !!mine}>
	{#if group.state === 'pending'}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="approve group"
			message={`Approve ${group.name}?`}
			action={() => activateGroup(group.rk)}
			disabled={!clubAdmin}
		/>
	{:else if group.state === 'active'}
		{#if mine}<ActionConfirmation
				inline
				arrow
				showLabel
				name="leave group"
				message="Leave this group?"
				action={() => leaveGroup(group.rk)}
			/>
		{:else}<ActionConfirmation
				inline
				arrow
				showLabel
				name="request to join"
				action={() => joinGroup(group.rk)}
				disabled={!$local.caller_id}
			/>{/if}
	{/if}
</EntityActions>
