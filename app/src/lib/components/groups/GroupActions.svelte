<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinGroup, leaveGroup } from '#lib/stores/remote.ts';
	let { group }: { group: GuidRow } = $props();
	const mine = $derived(
		relationsOf(group.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
</script>

{#if group.state === 'active'}
	<EntityActions more={!!mine}>
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
	</EntityActions>
{/if}
