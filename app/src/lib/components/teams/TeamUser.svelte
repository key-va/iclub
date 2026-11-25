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
	import { isTeamAdmin } from '#lib/components/rounds/roundRules.ts';
	import { acceptTeamMember } from '#lib/stores/remote.ts';

	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { team, user }: { team: GuidRow; user: GuidRow } = $props();
	const admin = $derived(
		isTeamAdmin(relationsOf(team.rk).find((row) => row.rk === $local.caller_id))
	);
	const pending = $derived(user.state === 'pending');
	const description = $derived(
		pending ? 'waiting to join' : isTeamAdmin(user) ? 'administrator' : 'member'
	);
</script>

{#snippet actions()}
	<ActionQuick
		inline
		name="accept"
		action={() => acceptTeamMember(team.rk, user.rk)}
	/>
	<RejectJoinRequest entityId={team.rk} userId={user.rk} />
{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(user.rk)}
	title={nameOf(user.rk)}
	{description}
	image={imageOf(user.rk)}
	colour="orange"
	children={pending && admin ? actions : undefined}
/>
