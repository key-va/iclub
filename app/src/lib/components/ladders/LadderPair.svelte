<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import { createMatch } from '#lib/stores/remote.ts';
	import { canChallenge, challengeDescription, ladderMembership, ladderStateColours } from './ladderRules.ts';

	let { ladder, pair }: { ladder: GuidRow; pair: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, $local.caller_id));
	const rank = $derived(Number(pair.rank));
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, {
		rk: pair.rk, rank, relation: pair,
	}));
	const description = $derived(challengeDescription(pair, membership.competitorId, eligible));
</script>

<RouteLinkHiddenAction href={hrefOf(pair.rk)} title={nameOf(pair.rk)} {description} image={imageOf(ladder.rk)} colour={ladderStateColours[String(pair.state)] ?? 'grey'}>
	{#snippet detail()}rank {rank}{/snippet}
	<ActionQuick inline name="challenge"
		action={() => createMatch(ladder.rk, membership.competitorId!, pair.rk)}
		disabled={!eligible} />
</RouteLinkHiddenAction>
