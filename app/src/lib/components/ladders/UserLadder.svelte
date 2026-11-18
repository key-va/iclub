<script lang="ts">
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
	import { createMatch, acceptLadderMember } from '#lib/stores/remote.ts';
	import {
		canChallenge,
		ladderMembership,
		ladderStateColours
	} from './ladderRules.ts';
	import RouteLink from '../routeLink.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
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
			ladder.format !== 'doubles' &&
			canChallenge(ladder, viewer.relation, viewer.competitorId, {
				rk: user.rk,
				rank,
				relation
			})
	);
	const canAccept = $derived(
		!matches.length &&
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
	{#snippet actions()}
		{#if eligible}<ActionQuick
				inline
				name="challenge"
				action={() => createMatch(ladder.rk, $local.caller_id!, user.rk)}
			/>{/if}
		{#if canAccept}
			{#if ladder.format === 'doubles'}<button class="grey" disabled>
					<p>waiting to join</p>
				</button>
			{:else}<ActionQuick
					inline
					name="accept"
					action={() => acceptLadderMember(ladder.rk, user.rk)}
				/>{/if}
		{/if}
	{/snippet}
	<RouteLinkHiddenAction
		href={hrefOf(ladder.rk)}
		title={nameOf(ladder.rk)}
		description={stateText}
		image={imageOf(ladder.rk)}
		colour={ladderStateColours[String(relation.state)] ?? 'grey'}
		children={eligible || canAccept ? actions : undefined}
	>
		{#snippet detail()}{Number.isFinite(rank) ? rank : 0}{/snippet}
	</RouteLinkHiddenAction>
	{#each matches as match (match.rk)}<RouteLink
			href={hrefOf(match.rk)}
			title={nameOf(match.rk)}
			description={String(entityOf(match.rk)?.state) + ' match'}
		/>{/each}
</div>
