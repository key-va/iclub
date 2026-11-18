<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		entityOf,
		relationsOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { acceptTeamMember } from '#lib/stores/remote.ts';
	import {
		isTeamAdmin,
		isTeamMember,
		outstandingTeamRounds
	} from '../rounds/roundRules.ts';
	import UserRound from '../rounds/UserRound.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
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
				? String(entity?.ext_section_name).toLowerCase() +
					' rank ' +
					entity?.ext_rank
				: 'pending'
	);
	const rounds = $derived(
		member ? outstandingTeamRounds(user.rk, team.rk) : []
	);
</script>

<div class="group">
	{#snippet actions()}<ActionQuick
			inline
			name="accept"
			action={() => acceptTeamMember(team.rk, user.rk)}
		/>{/snippet}
	<RouteLinkHiddenAction
		href={hrefOf(team.rk)}
		title={nameOf(team.rk)}
		{description}
		image={imageOf(team.rk)}
		colour="orange"
		children={canAccept ? actions : undefined}
	/>
	{#if member}
		{#each rounds as round (round.rk)}<UserRound {user} {team} {round} />
		{:else}<HiddenOptions title="No pending or selected rounds" />{/each}
	{/if}
</div>
