<script lang="ts">
	import UserMatch from '#lib/components/matches/UserMatch.svelte';
	import LadderActions from '#lib/components/ladders/LadderActions.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		nameOf,
		entityOf,
		relationsOf,
		hrefOf,
		imageOf,
		typeOf
	} from '#lib/stores/guids.ts';
	import LadderUser from '#lib/components/ladders/LadderUser.svelte';
	import LadderPair from '#lib/components/ladders/LadderPair.svelte';
	import LadderRequests from '#lib/components/ladders/LadderRequests.svelte';
	import {
		matchSummary,
		pastMatches
	} from '#lib/components/matches/matchRules.ts';

	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { activateLadder } from '#lib/stores/remote.ts';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const caller_id = $derived($local.caller_id);

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf(ladderId));
	// Singles list users; doubles list pairs. Competitive rank belongs to the ladder relation.
	const leaderboard = $derived(
		relationsOf(ladderId)
			.filter(
				(row) =>
					typeOf(row.rk) === (ladder?.format === 'doubles' ? 'pair' : 'user')
			)
			.filter((user) => user.is_participant === true)
			.sort((a, b) => Number(a.rank) - Number(b.rank))
	);

	const clubId = $derived(
		relationsOf(ladderId).filter(
			(row) => typeOf(row.rk) === 'club' && entityOf(row.rk)
		)[0]?.rk ?? ''
	);
	const isClubAdmin = $derived(
		relationsOf(clubId).some(
			(relation) => relation.rk === caller_id && relation.is_admin === true
		)
	);
	// Players who asked to join and are waiting for a ladder admin to accept
	const pending = $derived(
		relationsOf(ladderId)
			.filter((row) => typeOf(row.rk) === 'user' && entityOf(row.rk))
			.filter((user) => user.state === 'pending')
	);
	const isPending = $derived(pending.some((user) => user.rk === caller_id));
	const ongoingMatches = $derived(
		relationsOf(ladderId)
			.filter((row) => typeOf(row.rk) === 'match' && entityOf(row.rk))
			.filter(
				(match) =>
					entityOf(match.rk)?.state === 'pending' ||
					entityOf(match.rk)?.state === 'active'
			)
	);

	// The caller's matches on this ladder that are still pending or active
	const yourMatches = $derived(
		ongoingMatches.filter((match) =>
			relationsOf(match.rk)
				.filter((row) => typeOf(row.rk) === 'user' && entityOf(row.rk))
				.some((user) => user.rk === caller_id)
		)
	);

	// Finished matches on this ladder, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(
			relationsOf(ladderId).filter(
				(row) => typeOf(row.rk) === 'match' && entityOf(row.rk)
			)
		).sort((a, b) => b.rk.localeCompare(a.rk))
	);
</script>

<div class="page">
	{#if ladder}
		<EntityHeader entity={ladder} />

		{#if ladder.state === 'pending'}
			<div class="group">
				<HiddenOptions inline title="Pending" description="pending approval">
					<ActionConfirmation
						inline
						name="approve this ladder"
						message={`approve the ladder ${ladder.name} to make it active?`}
						action={() => activateLadder(ladderId)}
						disabled={!isClubAdmin}
					/>
				</HiddenOptions>
			</div>
		{/if}

		<LadderActions {ladder} />
		<LadderRequests {ladder} />

		<div class="group">
			{#if isPending}
				<RouteLink
					title={nameOf(caller_id ?? '')}
					description="waiting to join"
					href={hrefOf(caller_id ?? '')}
					image={imageOf(caller_id ?? '')}
				/>
			{/if}

			{#each yourMatches as match (match.rk)}<UserMatch
					match={entityOf(match.rk)!}
				/>{/each}

			<HiddenOptions title="Leaderboard" badge={leaderboard.length}
			></HiddenOptions>

			{#each leaderboard as player (player.rk)}
				{#if ladder.format === 'doubles'}
					<LadderPair {ladder} pair={player} />
				{:else}
					<LadderUser {ladder} user={player} />
				{/if}
			{/each}
		</div>

		<HiddenOptions title="Ongoing Matches">
			{#each ongoingMatches as match (match.rk)}
				<RouteLink
					href={hrefOf(match.rk)}
					title={nameOf(match.rk)}
					description={String(entityOf(match.rk)?.state) + ' match'}
				/>
			{/each}
		</HiddenOptions>

		<HiddenOptions title="Completed Matches">
			{#each history as match (match.rk)}
				<RouteLink
					href={hrefOf(match.rk)}
					title={nameOf(match.rk)}
					description={matchSummary(match.rk)}
				/>
			{/each}
		</HiddenOptions>
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />ladder
			</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
