<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import { createMatch } from '#lib/stores/remote.ts';
	import { canChallenge, challengeDescription, ladderMembership, ladderStandingColour } from './ladderRules.ts';

	let { ladder, user }: { ladder: GuidRow; user: GuidRow } = $props();
	const membership = $derived(ladderMembership(ladder, $local.caller_id));
	const rank = $derived(Number(user.rank));
	const target = $derived({ rk: user.rk, rank, relation: user });
	const eligible = $derived(canChallenge(ladder, membership.relation, membership.competitorId, target));
	const description = $derived(challengeDescription(user, membership.competitorId, eligible));
</script>

{#snippet challenge()}
	<ActionQuick inline name="challenge"
		action={() => createMatch(ladder.rk, membership.competitorId!, user.rk)} />
{/snippet}
<RouteLinkHiddenAction href={hrefOf(user.rk)} title={nameOf(user.rk)} {description}
	image={imageOf(user.rk)} colour={ladderStandingColour(ladder, membership, target)}
	children={eligible ? challenge : undefined} currentSelection={eligible ? undefined : membership.relation?.is_participant === true ? description : 'no actions'}>
	{#snippet detail()}rank {rank}{/snippet}
</RouteLinkHiddenAction>
