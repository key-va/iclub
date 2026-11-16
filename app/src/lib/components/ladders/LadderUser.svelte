<script lang="ts">
	import { guids, hrefOf, imageOf, type GuidRow } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLink from '../routeLink.svelte';
	import ApiService from '../apiService.svelte';
	import { canChallenge, challengeDescription, ladderMembership, ladderStateColours } from './ladderRules.ts';

	let { ladder, user }: { ladder: GuidRow; user: GuidRow & { relation: GuidRow } } = $props();
	const membership = $derived(ladderMembership($guids.items, ladder, $local.caller_id));
	const rank = $derived(Number(user.relation.rank));
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, {
		rk: user.rk, rank, relation: user.relation,
	}));
	const description = $derived(challengeDescription(user, membership.competitorId, eligible));
</script>

<RouteLink href={hrefOf(user.rk)} title={user.name ?? 'no name'} {description} image={imageOf(user.rk)}>
	{#snippet detail()}
		<span class="dot" style:background={ladderStateColours[String(user.relation.state)] ?? 'grey'} role="img" aria-label={String(user.relation.state)}></span>{rank}
	{/snippet}
	<ApiService inline name="challenge" message={`challenge ${user.name ?? 'this player'}?`}
		endpoint="match/create" data={{ ladder_id: ladder.rk, challenger_id: membership.competitorId, defender_id: user.rk }}
		disabled={!eligible} confirm={false} />
</RouteLink>

<style>
	.dot {
		display: inline-block;
		width: 0.7em;
		height: 0.7em;
		margin: 0 0.25em;
		border: 2px solid white;
		border-radius: 50%;
		vertical-align: baseline;
	}
</style>
