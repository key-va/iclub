<script lang="ts">
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
	const canAccept = $derived(
		!matches.length &&
			ladder.state === 'active' &&
			admin &&
			userRelation.state === 'pending' &&
			userRelation.is_participant !== true
	);
	const stateText = $derived(
		relation.state === 'active'
			? 'available'
			: relation.state === 'busy'
				? 'in a match'
				: relation.state === undefined
					? userRelation.is_admin === true
						? 'administrator'
						: ''
					: String(relation.state)
	);
</script>

<div class="group">
	<RouteLink
		href={hrefOf(ladder.rk)}
		title={nameOf(ladder.rk)}
		description={stateText}
		image={imageOf(ladder.rk)}
	>
		{#snippet detail()}{Number.isFinite(rank) ? rank : 0}{/snippet}
	</RouteLink>
	{#if canAccept}
		{#if ladder.format === 'doubles'}<div class="row right">
				<button class="grey" disabled><p>pending pair</p></button>
			</div>
		{:else}<ActionConfirmation
				arrow
				showLabel
				name="accept joiner"
				action={() => acceptLadderMemberConfirmation(ladder.rk, user.rk)}
			/>{/if}
	{:else if matches.length}
		{#each matches as match (match.rk)}<UserMatch
				match={entityOf(match.rk)!}
			/>{/each}
	{:else if eligible}
		<ActionConfirmation
			arrow
			showLabel
			name="issue challenge"
			action={() =>
				createMatchConfirmation(
					ladder.rk,
					viewer.competitorId!,
					membership.competitorId ?? user.rk
				)}
		/>
	{/if}

	{#if !matches.length && !eligible}<HiddenOptions
			title="No pending matches"
		/>{/if}
</div>
