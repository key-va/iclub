<script lang="ts">
	import ActionQuick from '../ActionQuick.svelte';
	import RejectJoinRequest from '#lib/components/RejectJoinRequest.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import {
		relationsOf,
		typeOf,
		entityOf,
		nameOf,
		hrefOf,
		imageOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import {
		createMatchConfirmation,
		acceptLadderMemberConfirmation
	} from '#lib/stores/remote.ts';
	import { canChallenge, ladderMembership } from './ladderRules.ts';
	import RouteLink from '../routeLink.svelte';

	import ActionConfirmation from '../ActionConfirmation.svelte';
	import UserMatch from '../matches/UserMatch.svelte';
	let { user, ladder }: { user: GuidRow; ladder: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, user.rk));
	const userRelation: Record<string, unknown> = $derived(
		membership.userRelation ?? {}
	);
	const relation: Record<string, unknown> = $derived(
		membership.relation ?? userRelation
	);
	const rank = $derived(Number(relation.rank));
	const viewer = $derived(ladderMembership(ladder, $local.caller_id));
	const admin = $derived(viewer.userRelation?.is_admin === true);
	const matches = $derived(
		relationsOf(user.rk)
			.filter((row) => typeOf(row.rk) === 'match' && entityOf(row.rk))
			.filter(
				(row) =>
					['pending', 'active'].includes(String(entityOf(row.rk)?.state)) &&
					relationsOf(row.rk).some((parent) => parent.rk === ladder.rk)
			)
	);
	const eligible = $derived(
		!matches.length &&
			user.rk !== $local.caller_id &&
			canChallenge(ladder, viewer.relation, viewer.competitorId, {
				rk: membership.competitorId ?? user.rk,
				rank,
				relation
			})
	);
	const pending = $derived(
		userRelation.state === 'pending' && userRelation.is_participant !== true
	);
	const ownPending = $derived(pending && user.rk === $local.caller_id);
	const canAccept = $derived(
		!matches.length &&
			ladder.state === 'active' &&
			admin &&
			pending && !ownPending
	);
	const stateText = $derived.by(() => {
		if (ownPending) return 'join request pending';
		if (relation.state === 'active') return 'available';
		if (relation.state === 'busy') return 'in a match';
		if (relation.state !== undefined) return String(relation.state);
		return userRelation.is_admin === true ? 'administrator' : '';
	});
</script>

{#snippet rankDetail()}rank {rank}{/snippet}

<div class="group">
	<RouteLink
		href={hrefOf(ladder.rk)}
		title={nameOf(ladder.rk)}
		description={stateText}
		image={imageOf(ladder.rk)}
		detail={Number.isFinite(rank) && rank > 0 ? rankDetail : undefined}
	/>
	{#if canAccept}
		<div class="row right">
			<RejectJoinRequest entityId={ladder.rk} userId={user.rk} />
			{#if ladder.format === 'doubles'}
				<button class="grey" disabled><p>pending pair</p></button>
			{:else}
				<ActionQuick inline name="accept joiner"
					action={() => acceptLadderMemberConfirmation(ladder.rk, user.rk)} />
			{/if}
		</div>
	{:else if matches.length}
		{#each matches as match (match.rk)}<UserMatch
				match={entityOf(match.rk)!}
			/>{/each}
	{:else if eligible}
		<ActionConfirmation
			arrow
			showLabel
			name="issue challenge"
			message={`challenge ${nameOf(user.rk)} in ${nameOf(ladder.rk)}?`}
			action={() =>
				createMatchConfirmation(
					ladder.rk,
					viewer.competitorId!,
					membership.competitorId ?? user.rk
				)}
		/>
	{:else if !ownPending}
		<HiddenOptions title="No pending matches" />
	{/if}
</div>
