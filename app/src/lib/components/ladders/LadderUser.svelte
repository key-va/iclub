<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import { createMatch } from '#lib/stores/remote.ts';
	import { canChallenge, ladderStatusDescription, ladderMembership, ladderStandingColour } from './ladderRules.ts';

	let { ladder, user }: { ladder: GuidRow; user: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, $local.caller_id));
	const rank = $derived(Number(user.rank));
	const target = $derived({ rk: user.rk, rank, relation: user });
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, target));
	const description = $derived(ladderStatusDescription(user));
</script>

{#snippet challenge()}
	<ActionQuick inline name="issue challenge" disabled={!eligible}
		action={() => createMatch(ladder.rk, membership.competitorId!, user.rk)} />
{/snippet}
<RouteLinkHiddenAction href={hrefOf(user.rk)} title={nameOf(user.rk)} {description}
	image={imageOf(user.rk)} colour={ladderStandingColour(ladder, membership, target)}
	children={challenge}>
	{#snippet detail()}rank {rank}{/snippet}
</RouteLinkHiddenAction>
