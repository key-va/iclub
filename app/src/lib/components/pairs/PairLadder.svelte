<script lang="ts">
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import PairMembers from './PairMembers.svelte';
	import MatchHistory from '#lib/components/matches/MatchHistory.svelte';

	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { createMatch, retirePair } from '#lib/stores/remote.ts';

	import {
		canChallenge as sharedCanChallenge,
		ladderMembership,
		ladderStateColours
	} from '#lib/components/ladders/ladderRules.ts';
	import { local } from '#lib/stores/local.ts';
	import {
		entityOf,
		relationsOf,
		hrefOf,
		imageOf,
		typeOf,
		nameOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	let { pair, ladderRow }: { pair: GuidRow; ladderRow?: GuidRow } = $props();
	const pairId = $derived(pair.rk);
	const members = $derived(
		relationsOf(pairId)
			.filter((row) => typeOf(row.rk) === 'user' && entityOf(row.rk))
			.filter((user) => user.role === 'member')
	);
	const ladder = $derived(ladderRow ? entityOf(ladderRow.rk) : undefined);
	const retired = $derived(ladderRow?.is_participant !== true);
	const canRetire = $derived(
		members.some((user) => user.rk === $local.caller_id) ||
			(!!ladder &&
				relationsOf(ladder.rk).some(
					(row) => row.rk === $local.caller_id && row.is_admin === true
				))
	);
	const matches = $derived(
		relationsOf(pairId)
			.filter((row) => typeOf(row.rk) === 'match' && entityOf(row.rk))
			.sort((a, b) => b.rk.localeCompare(a.rk))
	);
	const liveMatches = $derived(
		matches.filter(
			(match) =>
				entityOf(match.rk)?.state === 'pending' ||
				entityOf(match.rk)?.state === 'active'
		)
	);
	const myPair = $derived(
		ladder ? ladderMembership(ladder, $local.caller_id).pair : undefined
	);
	const canChallenge = $derived(
		sharedCanChallenge(ladder, myPair, myPair?.rk ?? null, {
			rk: pairId,
			rank: Number(ladderRow?.rank),
			relation: ladderRow ?? {}
		})
	);
	const canOfferChallenge = $derived(
		canChallenge && !liveMatches.length && !retired && myPair?.rk !== pairId
	);
	const stateText = $derived(
		retired
			? 'retired'
			: ladderRow?.state === 'active'
				? 'available'
				: ladderRow?.state === 'busy'
					? 'in a match'
					: String(ladderRow?.state)
	);
</script>

{#if ladder}
	<div class="group">
		<PairMembers {pairId} />
		{#snippet challengeAction()}
			<ActionQuick
				inline
				name="issue challenge"
				disabled={!canOfferChallenge}
				action={() => createMatch(ladder.rk, myPair!.rk, pairId)}
			/>
		{/snippet}
		<RouteLinkHiddenAction
			href={hrefOf(ladder.rk)}
			title={ladder.name ?? 'Ladder'}
			description={stateText}
			image={imageOf(ladder.rk)}
			colour={ladderStateColours[String(ladderRow?.state)] ?? 'grey'}
			children={challengeAction}
		>
			{#snippet detail()}{Number(ladderRow?.rank) || 0}{/snippet}
		</RouteLinkHiddenAction>
		{#each liveMatches as match (match.rk)}
			<RouteLink
				href={hrefOf(match.rk)}
				title={nameOf(match.rk)}
				description={String(entityOf(match.rk)?.state)}
				isWhite={false}
			/>
		{/each}
	</div>
{/if}

<MatchHistory parentId={pairId} />
{#if !retired && canRetire}
	<HiddenOptions inline title="More Options" description="retire partnership">
		<ActionConfirmation
			inline
			name="retire"
			message={`retire ${nameOf(pairId)}? Ongoing matches will be forfeited`}
			action={() => retirePair(pairId)}
		/>
	</HiddenOptions>
{/if}
