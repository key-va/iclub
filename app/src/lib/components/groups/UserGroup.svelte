<script lang="ts">
	import RejectJoinRequest from '#lib/components/RejectJoinRequest.svelte';
	import { local } from '#lib/stores/local.ts';
	import {
		entityOf,
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { acceptGroupMember } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { user, group }: { user: GuidRow; group: GuidRow } = $props();
	const entity = $derived(entityOf(group.rk));
	const admin = $derived(
		relationsOf(group.rk).some(
			(row) => row.rk === $local.caller_id && row.is_admin === true
		)
	);
	const canAccept = $derived(
		entity?.state === 'active' && group.state === 'pending' && admin
	);
	const description = $derived(
		entity?.state === 'pending'
			? 'pending club approval'
			: group.is_participant === true
				? 'group'
				: 'pending'
	);
</script>

{#if group.is_participant === true || group.state === 'pending'}
	{#snippet actions()}
		<ActionQuick
			inline
			name="accept"
			action={() => acceptGroupMember(group.rk, user.rk)}
		/>
		<RejectJoinRequest entityId={group.rk} userId={user.rk} />
	{/snippet}
	<RouteLinkHiddenAction
		href={hrefOf(group.rk)}
		title={nameOf(group.rk)}
		{description}
		image={imageOf(group.rk)}
		colour="orange"
		children={canAccept ? actions : undefined}
	/>
{/if}
