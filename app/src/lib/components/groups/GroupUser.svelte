<script lang="ts">
	import RejectJoinRequest from '#lib/components/RejectJoinRequest.svelte';
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import { acceptGroupMember } from '#lib/stores/remote.ts';

	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { group, user }: { group: GuidRow; user: GuidRow } = $props();
	const admin = $derived(
		Boolean(
			relationsOf(group.rk).find((row) => row.rk === $local.caller_id)
				?.is_admin === true
		)
	);
	const pending = $derived(user.state === 'pending');
	const description = $derived(
		pending
			? 'waiting to join'
			: user.is_admin === true
				? 'admin'
				: 'participant'
	);
</script>

{#snippet actions()}
	<ActionQuick
		inline
		name="accept"
		action={() => acceptGroupMember(group.rk, user.rk)}
	/>
	<RejectJoinRequest entityId={group.rk} userId={user.rk} />
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(user.rk)}
	title={nameOf(user.rk)}
	{description}
	image={imageOf(user.rk)}
	colour="orange"
	children={pending && admin ? actions : undefined}
/>
