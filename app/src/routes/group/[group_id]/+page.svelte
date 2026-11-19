<script lang="ts">
	import GroupActions from '#lib/components/groups/GroupActions.svelte';
	import GroupSummary from '#lib/components/groups/GroupSummary.svelte';

	import MessageThread from '#lib/components/messages/MessageThread.svelte';

	import { page } from '$app/state';
	import { guids, entityOf } from '#lib/stores/guids.ts';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.group_id ?? '');
	const group = $derived(entityOf(id));
</script>

<div class="page">
	{#if group}
		<EntityHeader entity={group} />
		<GroupSummary {group} />

		<MessageThread parentId={id} />
		<GroupActions {group} section="options" />
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />group
			</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
