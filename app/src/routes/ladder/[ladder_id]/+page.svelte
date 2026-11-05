<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import { ladderSettings } from '#lib/strings.ts';
	import { canChallenge as sharedCanChallenge, type ChallengeTarget } from '#lib/challenge.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const { caller_id } = $local;

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	// Participants are the users flagged is_participant on their ladder relation, best (lowest) rank first
	const leaderboard = $derived(
		relatedEntities($guids.items, ladderId, 'user')
			.filter((user) => user.relation.is_participant === true)
			.map((user) => ({ ...user, rank: Number(user.relation.rank) }))
			.sort((a, b) => a.rank - b.rank)
	);

	const clubId = $derived(relatedEntities($guids.items, ladderId, 'club')[0]?.rk ?? '');
	const isClubAdmin = $derived(
		relationsOf($guids.items, clubId).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const myRelation = $derived(
		relatedEntities($guids.items, ladderId, 'user').find((user) => user.rk === caller_id)?.relation
	);

	// Players who asked to join and are waiting for a ladder admin to accept
	const pending = $derived(
		relatedEntities($guids.items, ladderId, 'user').filter((user) => user.relation.state === 'pending')
	);
	const isPending = $derived(pending.some((user) => user.rk === caller_id));
	const isLadderAdmin = $derived(
		relationsOf($guids.items, ladderId).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);

	let showRules = $state(false);

	// The caller's matches on this ladder that are still pending or active
	const yourMatches = $derived(
		relatedEntities($guids.items, ladderId, 'match').filter(
			(match) =>
				(match.state === 'pending' || match.state === 'active') &&
				relatedEntities($guids.items, match.rk, 'user').some((user) => user.rk === caller_id)
		)
	);

	const canChallenge = (target: ChallengeTarget) => sharedCanChallenge(ladder, myRelation, caller_id, target);

	function challengeText(target: { rk: string; rank: number; relation: Record<string, unknown> }) {
		const state = String(target.relation.state);
		if (target.rk === caller_id) return state === 'active' ? 'available' : `${state}`;
		if (state === 'away') return 'away';
		if (state === 'busy') return 'in a match';
		return canChallenge(target) ? 'long tap to challenge' : 'cannot challenge';
	}

	const stateColours: Record<string, string> = { away: 'red', busy: 'gold', cooling: 'blue', active: 'green' };

	// The dot always reflects the listed player's own state
	function dotColour(target: { relation: Record<string, unknown> }) {
		return stateColours[String(target.relation.state)] ?? 'grey';
	}
</script>

<div class="page">
	{#if ladder}
		
		<div class="row right">
			<p class="truncate"><strong>{ladder.name}</strong><br />{ladder.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{ladder.rk}.jpg');"></div>
		</div>

		{#if ladder.state === 'pending'}
			<div class="group">
				<HiddenOptions inline title="Pending" description="waiting approval">
					<ApiService
						inline
						name="accept"
						message={`accept the ladder ${ladder.name} and make it active?`}
						endpoint={`ladder/${ladderId}/activate`}
						disabled={!isClubAdmin}
					/>
				</HiddenOptions>
			</div>
		{/if}

		{#if isLadderAdmin && pending.length > 0}
			<div class="group">
				{#each pending as player (player.rk)}
					<RouteLink
						href={hrefOf(player.rk)}
						title={player.name ?? 'no name'}
						description="waiting to join"
						image={imageOf(player.rk)}
					>
						<ApiService
							inline
							name="accept"
							message={`accept ${player.name ?? 'this player'} onto the ladder?`}
							endpoint={`ladder/${ladderId}/accept`}
							data={{ user_id: player.rk }}
						/>
					</RouteLink>
				{/each}
			</div>
		{/if}

		<div class="group">

		<HiddenOptions title="Leaderboard" badge={leaderboard.length}>
		</HiddenOptions>
		{#if ladder.state === 'active' && myRelation?.is_participant !== true && !isPending}
				<ApiService name="join" message={`join the ladder ${ladder.name}?`} endpoint={`ladder/${ladderId}/join`} disabled={!caller_id} />
		{/if}

		{#each leaderboard as player (player.rk)}
			<RouteLink
				href={hrefOf(player.rk)}
				title={player.name ?? 'no name'}
				description={challengeText(player)}
				image={imageOf(player.rk)}>
				{#snippet detail()}
					<span class="dot" style="background: {dotColour(player)}" role="img" aria-label={String(player.relation?.state)}></span>{player.rank}
				{/snippet}

				<ApiService
					inline
					name="challenge"
					message={`challenge ${player.name ?? 'this player'}?`}
					endpoint="match/create"
					data={{ ladder_id: ladderId, challenger_id: caller_id, defender_id: player.rk }}
					disabled={!canChallenge(player)}
				/>				
			</RouteLink>
		{/each}
		</div>

		<HiddenOptions title="Match History" badge="?">
		</HiddenOptions>
		
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />ladder</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
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
