<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, relationsOf, typeOf, entityOf, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLink from '../routeLink.svelte';
	import ApiService from '../apiService.svelte';
	import { canChallenge, ladderMembership, ladderStateColours } from './ladderRules.ts';

	let { user, ladder }: { user: GuidRow; ladder: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, user.rk));
	const userRelation: Record<string, unknown> = $derived(membership.userRelation ?? {});
	const relation: Record<string, unknown> = $derived(membership.relation ?? userRelation);
	const rank = $derived(Number(relation.rank));
	const viewer = $derived(ladderMembership(ladder, $local.caller_id));
	const isLadderAdmin = $derived(viewer.userRelation?.is_admin === true);
	const eligible = $derived(canChallenge(ladder, viewer.relation, viewer.competitorId, {
		rk: membership.competitorId ?? user.rk, rank, relation,
	}));
	const matches = $derived(
		relationsOf(user.rk).filter(row => typeOf(row.rk) === 'match' && entityOf(row.rk)).filter(match =>
			['pending', 'active'].includes(String(entityOf(match.rk)?.state)) &&
			relationsOf(match.rk).filter(row => typeOf(row.rk) === 'ladder' && entityOf(row.rk)).some(parent => parent.rk === ladder.rk)),
	);
	const stateText = $derived.by(() => {
		const state = String(relation.state);
		if (state === 'active') return 'available';
		if (state === 'busy') return 'in a match';
		if (state === 'undefined') return userRelation.is_admin === true ? 'administrator' : '';
		return state;
	});
</script>

<div class="group">
	<RouteLink
		href={hrefOf(ladder.rk)}
		title={ladder.name ?? 'no name'}
		description={stateText}
		isWhite={false}
		image={imageOf(ladder.rk)}
	>
		{#snippet detail()}
			<span class="dot" style="background: {ladderStateColours[String(relation.state)] ?? 'grey'}; display: inline-block; width: 0.7em; height: 0.7em; margin: 0 0.25em; border: 2px solid white; border-radius: 50%;" role="img" aria-label={String(relation.state)}></span>{Number.isFinite(rank) ? rank : 0}
		{/snippet}
	</RouteLink>
	{#each matches as match (match.rk)}
		<RouteLink
			href={hrefOf(match.rk)}
			title={nameOf(match.rk)}
			description={String(entityOf(match.rk)?.state) + ' match'}
			isWhite={false}
		/>
	{:else}
		{#if user.rk !== $local.caller_id && ladder.format !== 'doubles' && eligible}
			<ApiService
				name="challenge"
				message={`challenge ${user.name ?? 'this player'}?`}
				endpoint="match/create"
				data={{ ladder_id: ladder.rk, challenger_id: $local.caller_id, defender_id: user.rk }}
				disabled={!eligible}
			/>
		{/if}
		{#if userRelation.state === 'pending' && userRelation.is_participant !== true && isLadderAdmin}
			{#if ladder.format === 'doubles'}
				<div class="row right">
					<button class="grey" disabled><p>waiting to join</p></button>
				</div>
			{:else}
				<ApiService
					name="accept"
					message={`accept ${user.name ?? 'this player'} into this ladder?`}
					endpoint={`ladder/${ladder.rk}/accept`}
					data={{ user_id: user.rk }}
					disabled={!isLadderAdmin}
				/>
			{/if}
		{/if}
	{/each}
</div>
