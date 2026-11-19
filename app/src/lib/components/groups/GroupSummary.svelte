<script lang="ts">
	import GroupActions from './GroupActions.svelte';
	import GroupUser from '#lib/components/groups/GroupUser.svelte';

	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';

	import { local } from '#lib/stores/local.ts';
	import {
		entityOf,
		relationsOf,
		typeOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import { activateGroup } from '#lib/stores/remote.ts';

	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	let { group }: { group: GuidRow } = $props();
	const id = $derived(group.rk);
	const users = $derived(
		relationsOf(id).filter(
			(row) =>
				typeOf(row.rk) === 'user' && row.state !== 'left' && entityOf(row.rk)
		)
	);
	const mine = $derived(users.find((user) => user.rk === $local.caller_id));
	const admin = $derived(mine?.is_admin === true);
	const club = $derived(
		relationsOf(id).filter(
			(row) => typeOf(row.rk) === 'club' && entityOf(row.rk)
		)[0]
	);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk)
				.filter(
					(row) =>
						typeOf(row.rk) === 'user' &&
						row.state !== 'left' &&
						entityOf(row.rk)
				)
				.some((user) => user.rk === $local.caller_id && user.is_admin === true)
	);
	const participants = $derived(
		users.filter((user) => user.is_participant === true)
	);
	const pending = $derived(users.filter((user) => user.state === 'pending'));
</script>

<div class="group">
	{#if group.state === 'pending'}
		{#if clubAdmin}
			<HiddenOptions inline title="Pending" description="pending club approval">
				<ActionConfirmation
					inline
					name="approve group"
					message={`Approve ${group.name}?`}
					action={() => activateGroup(id)}
				/>
			</HiddenOptions>
		{:else}<HiddenOptions
				title="Pending"
				description="pending club approval"
			/>{/if}
	{:else if group.state === 'active'}
		<GroupActions {group} />
		{#if admin}
			{#each pending as user (user.rk)}
				<GroupUser {group} {user} />
			{/each}
		{/if}
		{#if mine?.state === 'pending'}
			<HiddenOptions title="Pending" description="waiting to join" />
		{/if}
	{/if}
	<HiddenOptions title="Participants">
		{#each participants as user (user.rk)}
			<GroupUser {group} {user} />
		{/each}
	</HiddenOptions>
</div>
