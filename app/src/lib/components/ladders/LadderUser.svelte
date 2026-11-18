<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import { createMatch } from '#lib/stores/remote.ts';
	import { canChallenge, challengeDescription, ladderMembership, ladderStateColours } from './ladderRules.ts';

	let { ladder, user }: { ladder: GuidRow; user: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, $local.caller_id));
	const rank = $derived(Number(user.rank));
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, {
		rk: user.rk, rank, relation: user,
	}));
	const description = $derived(challengeDescription(user, membership.competitorId, eligible));
</script>

<RouteLinkHiddenAction href={hrefOf(user.rk)} title={nameOf(user.rk)} {description} image={imageOf(user.rk)} colour={ladderStateColours[String(user.state)] ?? 'grey'}>
	{#snippet detail()}{rank}{/snippet}
	<ActionQuick inline name="challenge"
		action={() => createMatch(ladder.rk, membership.competitorId!, user.rk)}
		disabled={!eligible} />
</RouteLinkHiddenAction>
