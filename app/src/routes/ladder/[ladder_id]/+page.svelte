<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import { ladderSettings, ladderSettingDefaults } from '#lib/strings.ts';

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

	// Ranks a challenger may climb under the ladder system; win_points costs one point per rank
	function canChallenge(target: { rk: string; rank: number; relation: Record<string, unknown> }) {
		const me = myRelation;
		if (!me || me.is_participant !== true || me.state !== 'active') return false;
		if (target.rk === caller_id || !['active', 'cooling'].includes(String(target.relation.state))) return false;
		const myRank = Number(me.rank);
		const steps = myRank - target.rank;
		if (!(steps > 0)) return false;
		const system = String(ladder?.ladder_system ?? ladderSettingDefaults.ladder_system);
		if (system === 'win_points') return Number(me.points) >= steps;
		if (system === 'half_rank') return steps <= Math.floor(myRank / 2);
		const range = Number(system.match(/^static_range_(\d+)$/)?.[1]);
		return steps <= range;
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
				<HiddenOptions inline title="Pending" description="waiting admin approval">
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

		{#if ladder.state === 'active' && myRelation?.is_participant !== true && !isPending}
			<ApiService name="join" message={`join the ladder ${ladder.name}?`} endpoint={`ladder/${ladderId}/join`} disabled={!caller_id} />
		{:else if ladder.state === 'active' && myRelation?.is_participant === true}
			<div class="group">
				<HiddenOptions title="Active Matches" description="" badge={yourMatches.length} />
				{#each yourMatches as match (match.rk)}
					<RouteLink
						href={hrefOf(match.rk)}
						title={match.name ?? 'no name'}
						description={match.state === 'pending' ? 'waiting to be accepted' : 'accepted, ready to play'}
						isWhite={false}
					/>
				{/each}
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

		{#each leaderboard as player (player.rk)}
				<RouteLink
					href={hrefOf(player.rk)}
					title={player.name ?? 'no name'}
					description={`${player.relation?.state} rank ${player.rank}`}
					isWhite={player.rk === caller_id}
					image={imageOf(player.rk)}>

					<ApiService
						inline
						name="challenge"
						message={`challenge ${player.name ?? 'this player'}?`}
						endpoint="match/create"
						data={{ ladder_id: ladderId, challenger_id: caller_id, defender_id: player.rk }}
						disabled={!canChallenge(player)}
					/>				
				</RouteLink>
		{:else}
			<div class="row right">
				<p class="truncate"><strong>No Participants</strong><br />leaderboard</p>
				<div class="blank-icon-small"></div>
			</div>
		{/each}

		
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
</style>
