<script lang="ts">
	import GroupActions from './GroupActions.svelte';
	import GroupUser from '#lib/components/groups/GroupUser.svelte';

	import { local } from '#lib/stores/local.ts';
	import {
		entityOf,
		relationsOf,
		typeOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	let { group }: { group: GuidRow } = $props();
	const rows = $derived(relationsOf(group.rk));
	const users = $derived(
		rows.filter(
			(row) =>
				typeOf(row.rk) === 'user' && row.state !== 'left' && entityOf(row.rk)
		)
	);
	const mine = $derived(users.find((user) => user.rk === $local.caller_id));
	const admin = $derived(mine?.is_admin === true);
	const participants = $derived(
		users.filter((user) => user.is_participant === true)
	);
	const pending = $derived(users.filter((user) => user.state === 'pending'));
	const messageCount = $derived(rows.filter((row) => typeOf(row.rk) === 'message' && entityOf(row.rk)).length);
	const summary = $derived(
		`${participants.length} ${participants.length === 1 ? 'member' : 'members'} • ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`
	);
</script>

<GroupActions {group} {summary} section="primary" />
<div class="group">
	{#if group.state === 'active'}
		{#if admin}
			{#each pending as user (user.rk)}
				<GroupUser {group} {user} />
			{/each}
		{/if}
		{#if mine?.state === 'pending'}
			<HiddenOptions title="Pending" description="waiting to join" />
		{/if}
	{/if}
	<HiddenOptions title="Group Members">
		{#each participants as user (user.rk)}
			<GroupUser {group} {user} />
		{/each}
	</HiddenOptions>
</div>
