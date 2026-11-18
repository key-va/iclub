<script lang="ts">
	import GroupSummary from '#lib/components/groups/GroupSummary.svelte';

	import MessageThread from '#lib/components/messages/MessageThread.svelte';

	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relationsOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.group_id ?? '');
	const group = $derived(entityOf(id));
	const admin = $derived(
		relationsOf(id).some(
			(row) => row.rk === $local.caller_id && row.is_admin === true
		)
	);
</script>

<div class="page">
	{#if group}
		<EntityHeader entity={group} />
		<GroupSummary {group} />

		<MessageThread parentId={id} />
		{#if admin}<RouteLink
				href={`/group/${id}/edit`}
				title="Edit Group"
				description="name and image"
			/>{/if}
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
