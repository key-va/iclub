<script lang="ts">
	import { guids, hrefOf, imageOf, type GuidRow } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLink from '../routeLink.svelte';
	import ApiService from '../apiService.svelte';
	import { canChallenge, challengeDescription, ladderMembership, ladderStateColours } from './ladderRules.ts';

	let { ladder, pair }: { ladder: GuidRow; pair: GuidRow & { relation: GuidRow } } = $props();
	const membership = $derived(ladderMembership($guids.items, ladder, $local.caller_id));
	const rank = $derived(Number(pair.relation.rank));
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, {
		rk: pair.rk, rank, relation: pair.relation,
	}));
	const description = $derived(challengeDescription(pair, membership.competitorId, eligible));
</script>

<RouteLink href={hrefOf(pair.rk)} title={pair.name ?? 'no name'} {description} image={imageOf(ladder.rk)}>
	{#snippet detail()}
		<span class="dot" style:background={ladderStateColours[String(pair.relation.state)] ?? 'grey'} role="img" aria-label={String(pair.relation.state)}></span>{rank}
	{/snippet}
	<ApiService inline name="challenge" message={`challenge ${pair.name ?? 'this player'}?`}
		endpoint="match/create" data={{ ladder_id: ladder.rk, challenger_id: membership.competitorId, defender_id: pair.rk }}
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
