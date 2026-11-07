<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import { ladderSettings } from '#lib/strings.ts';
	import { canChallenge as sharedCanChallenge, type ChallengeTarget } from '#lib/challenge.ts';
	import { matchSummary, pastMatches } from '#lib/matchSummary.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const { caller_id } = $local;

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	// Participants are the users flagged is_participant on their ladder relation, best (lowest) rank first
	const leaderboard = $derived(
		relatedEntities($guids.items, ladderId, ladder?.format === 'doubles' ? 'pair' : 'user')
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
	let selectedPairUserId = $state<string | null>(null);
	const selectedPairUser = $derived(pending.find(player => player.rk === selectedPairUserId));
	$effect(() => {
		if (!selectedPairUser) selectedPairUserId = null;
	});
	const myPair = $derived(relatedEntities($guids.items, ladderId, 'pair').filter((pair) => pair.relation.is_participant === true).find((pair) =>
		relatedEntities($guids.items, pair.rk, 'user').some((member) => member.rk === caller_id)
	));
	const myCompetitiveRelation = $derived(ladder?.format === 'doubles' ? myPair?.relation : myRelation);

	// The caller's matches on this ladder that are still pending or active
	const yourMatches = $derived(
		relatedEntities($guids.items, ladderId, 'match').filter(
			(match) =>
				(match.state === 'pending' || match.state === 'active') &&
				relatedEntities($guids.items, match.rk, 'user').some((user) => user.rk === caller_id)
		)
	);

	const canChallenge = (target: ChallengeTarget) => sharedCanChallenge(ladder, myCompetitiveRelation, ladder?.format === 'doubles' ? myPair?.rk ?? null : caller_id, target);

	// Finished matches on this ladder, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(relatedEntities($guids.items, ladderId, 'match')).sort((a, b) => b.rk.localeCompare(a.rk))
	);

	function challengeText(target: { rk: string; rank: number; relation: Record<string, unknown> }) {
		const state = String(target.relation.state);
		if (target.rk === (ladder?.format === 'doubles' ? myPair?.rk : caller_id)) return state === 'active' ? 'available' : `${state}`;
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
					<RouteLink href={hrefOf(player.rk)} title={player.name ?? 'no name'} description="waiting to join" image={imageOf(player.rk)}>
						{#if ladder.format === 'doubles'}
							{#if selectedPairUser && selectedPairUser.rk !== player.rk}
								<ApiService inline name={`pair with ${selectedPairUser.name ?? 'this player'}`} message={`pair ${player.name ?? 'this player'} with ${selectedPairUser.name ?? 'this player'}?`} endpoint={`ladder/${ladderId}/accept`} data={{ user_ids: [selectedPairUser.rk, player.rk] }} onsuccess={() => { selectedPairUserId = null; }} />
							{:else}
								<button class="blue" aria-label={selectedPairUserId === player.rk ? 'deselect player' : 'select player'} onclick={() => selectedPairUserId = selectedPairUserId === player.rk ? null : player.rk}><p>{selectedPairUserId === player.rk ? 'selected' : 'select'}</p></button>
							{/if}
						{:else}
							<ApiService inline name="accept" message={`accept ${player.name ?? 'this player'} onto the ladder?`} endpoint={`ladder/${ladderId}/accept`} data={{ user_id: player.rk }} />
						{/if}
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
				description={`${challengeText(player)}${ladder.format !== 'doubles' && ladder.ladder_system === 'win_points' ? ` · ${player.relation.points ?? 0} points` : ''}`}
				image={imageOf(ladder.format === 'doubles' ? ladderId : player.rk)}>
				{#snippet detail()}
					<span class="dot" style="background: {dotColour(player)}" role="img" aria-label={String(player.relation?.state)}></span>{player.rank}
				{/snippet}

				<ApiService
					inline
					name="challenge"
					message={`challenge ${player.name ?? 'this player'}?`}
					endpoint="match/create"
					data={{ ladder_id: ladderId, challenger_id: ladder?.format === 'doubles' ? myPair?.rk : caller_id, defender_id: player.rk }}
					disabled={!canChallenge(player)}
				/>				
			</RouteLink>
		{/each}
		</div>

        {#if yourMatches.length > 0}
            <div class="group">
                <HiddenOptions title="Your matches" badge={yourMatches.length} />
                {#each yourMatches as match (match.rk)}
                    <RouteLink href={hrefOf(match.rk)} title={match.name ?? 'Match'} description={String(match.state)} />
                {/each}
            </div>
        {/if}
        {#if isPending}
            <HiddenOptions title="Waiting to join" description={ladder.format === 'doubles' ? 'An admin will pair you with another pending player' : 'Waiting for admin approval'} />
        {/if}
        <HiddenOptions title="Match History" badge={history.length}>
			{#each history as match (match.rk)}
				<RouteLink href={hrefOf(match.rk)} title={match.name ?? 'no name'} description={matchSummary($guids.items, match.rk)} />
			{/each}
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
