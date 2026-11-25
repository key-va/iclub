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
	import { acceptTeamMemberConfirmation } from '#lib/stores/remote.ts';
	import {
		teamDescription,
		isTeamAdmin,
		isTeamMember,
		outstandingTeamRounds
	} from '../rounds/roundRules.ts';
	import UserRound from '../rounds/UserRound.svelte';
	import RouteLink from '../routeLink.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	let { user, team }: { user: GuidRow; team: GuidRow } = $props();
	const entity = $derived(entityOf(team.rk));
	const member = $derived(isTeamMember(team));
	const admin = $derived(
		isTeamAdmin(relationsOf(team.rk).find((row) => row.rk === $local.caller_id))
	);
	const canAccept = $derived(
		entity?.state === 'active' && team.state === 'pending' && admin
	);
	const description = $derived(
		entity?.state === 'pending'
			? 'pending club approval'
			: member
				? teamDescription(entity)
				: 'pending'
	);
	const rounds = $derived(
		member ? outstandingTeamRounds(user.rk, team.rk) : []
	);
</script>

<div class="group">
	<RouteLink
		href={hrefOf(team.rk)}
		title={nameOf(team.rk)}
		{description}
		image={imageOf(team.rk)}
	/>
	{#if canAccept}
		<div class="row right">
			<RejectJoinRequest entityId={team.rk} userId={user.rk} />
			<ActionQuick inline name="accept joiner"
				action={() => acceptTeamMemberConfirmation(team.rk, user.rk)} />
		</div>
	{/if}

	{#each rounds as round (round.rk)}<UserRound {user} {team} {round} />
	{:else}<HiddenOptions title="No pending rounds" />{/each}
</div>
