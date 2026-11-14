<script lang="ts">
	import { isTeamAdmin, isTeamMember, outstandingTeamRounds } from '#lib/rounds.ts';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import ApiService from '#lib/components/apiService.svelte';
	import { canChallenge as sharedCanChallenge } from '#lib/challenge.ts';
	import { matchSummary, pastMatches } from '#lib/matchSummary.ts';

	const { caller_id, device_id } = $local;

	const user_id = $derived(page.params.user_id ?? '');
	const user_entity = $derived(entityOf($guids.items, user_id));
	const adminClubs = $derived(
		relatedEntities($guids.items, user_id, 'club').filter((club) => club.relation.is_admin === true)
	);
	const pendingApprovalLadders = $derived(
		adminClubs.flatMap((club) =>
			relatedEntities($guids.items, club.rk, 'ladder').filter((ladder) => ladder.state === 'pending')
		)
	);

    const groups = $derived(relatedEntities($guids.items, user_id, 'group'));
    const pendingGroups = $derived(adminClubs.flatMap(club => relatedEntities($guids.items, club.rk, 'group').filter(group => group.state === 'pending')));
    const teams = $derived(relatedEntities($guids.items, user_id, 'team'));
    const pendingTeams = $derived(adminClubs.flatMap(club => relatedEntities($guids.items, club.rk, 'team').filter(team => team.state === 'pending')));

	// Ladders this user is associated with, carrying their rank (if any) from the relation
	const ladders = $derived(
		relatedEntities($guids.items, user_id, 'ladder').map((ladder) => {
			const pair = ladder.format === 'doubles'
				? relatedEntities($guids.items, ladder.rk, 'pair').find(pair =>
					pair.relation.is_participant === true && relatedEntities($guids.items, pair.rk, 'user').some(member => member.rk === user_id))
				: undefined;
			const relation = pair?.relation ?? ladder.relation;
			return { ...ladder, format: ladder.format, userRelation: ladder.relation, relation, rank: Number(relation.rank) };
		})
	);
	// Matches still in play 	(pending or active) that this user is part of
	const liveMatches = $derived(
			relatedEntities($guids.items, user_id, 'match').filter((match) => match.state === 'pending' || match.state === 'active')
	);
	const matchesOf = (ladderId: string) =>
		liveMatches.filter((match) => relatedEntities($guids.items, match.rk, 'ladder').some((ladder) => ladder.rk === ladderId));

	// Finished matches this user played, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(relatedEntities($guids.items, user_id, 'match')).sort((a, b) => b.rk.localeCompare(a.rk))
	);

	const stateColours: Record<string, string> = { away: 'red', busy: 'gold', cooling: 'blue', active: 'green' };
	const dotColour = (ladder: { relation: Record<string, unknown> }) => stateColours[String(ladder.relation?.state)] ?? 'grey';
	function stateText(ladder: { relation: Record<string, unknown>; userRelation: Record<string, unknown> }) {
		const state = String(ladder.relation?.state);
		if (state === 'active') return 'available';
		if (state === 'busy') return 'in a match';
		if (state === 'undefined') return ladder.userRelation.is_admin === true ? 'administrator' : '';
		return state;
	}

	// Whether the caller may challenge the viewed user on this ladder
	function canChallenge(ladder: { rank: number; relation: Record<string, unknown> }, ladderId: string) {
		const me = relatedEntities($guids.items, ladderId, 'user').find((user) => user.rk === caller_id)?.relation;
		return sharedCanChallenge(entityOf($guids.items, ladderId), me, caller_id, {
			rk: user_id,
			rank: ladder.rank,
			relation: ladder.relation
		});
	}

	// Whether the caller is an admin of the ladder
	const isLadderAdmin = (ladderId: string) => relatedEntities($guids.items, ladderId, 'user').some((user) => user.rk === caller_id && user.relation?.is_admin === true);
</script>

<div class="page">
	{#if user_entity}
		<div class="row right">
			<p class="truncate"><strong>{user_entity.name}</strong><br />{user_entity.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{user_entity.rk}.jpg');"></div>
		</div>
		<InstallApp />

		{#if user_id === caller_id && adminClubs.length > 0}
			<div class="group">
				{#each pendingApprovalLadders as ladder (ladder.rk)}
					<RouteLink
						href={hrefOf(ladder.rk)}
						title={ladder.name ?? 'no name'}
						description="pending club approval"
						isWhite={false}
						image={imageOf(ladder.rk)}
					/>
				{/each}
			</div>
		{/if}

        {#if user_id === $local.caller_id}
            {#each pendingTeams as team}<RouteLink href={hrefOf(team.rk)} title={team.name} description="pending club approval" image={imageOf(team.rk)} />{/each}
            {#each pendingGroups as group (group.rk)}<RouteLink href={hrefOf(group.rk)} title={group.name} description="pending club approval" image={imageOf(group.rk)} isWhite={true} />{/each}
        {/if}

		{#each ladders as ladder (ladder.rk)}
			<div class="group">
				<RouteLink
					href={hrefOf(ladder.rk)}
					title={ladder.name ?? 'no name'}
					description={stateText(ladder)}
					isWhite={false}
					image={imageOf(ladder.rk)}
				>
					{#snippet detail()}
						<span class="dot" style="background: {dotColour(ladder)}; display: inline-block; width: 0.7em; height: 0.7em; margin: 0 0.25em; border: 2px solid white; border-radius: 50%;" role="img" aria-label={String(ladder.relation?.state)}></span>{Number.isFinite(ladder.rank) ? ladder.rank : 0}
					{/snippet}
				</RouteLink>
				{#each matchesOf(ladder.rk) as match (match.rk)}
					<RouteLink
						href={hrefOf(match.rk)}
						title={match.name ?? 'no name'}
						description={String(match.state) + ' match'}
						isWhite={false}
					/>
				{:else}
					{#if user_id !== caller_id && ladder.format !== 'doubles' && canChallenge(ladder, ladder.rk)}
						<ApiService
							name="challenge"
							message={`challenge ${user_entity.name ?? 'this player'}?`}
							endpoint="match/create"
							data={{ ladder_id: ladder.rk, challenger_id: caller_id, defender_id: user_id }}
							disabled={!canChallenge(ladder, ladder.rk)}
						/>
					{/if}
					{#if ladder.userRelation.state === 'pending' && ladder.userRelation.is_participant !== true && isLadderAdmin(ladder.rk)}
						{#if ladder.format === 'doubles'}
							<div class="row right">
								<button class="grey" disabled><p>waiting to join</p></button>
							</div>
						{:else}
							<ApiService
								name="accept"
								message={`accept ${user_entity.name ?? 'this player'} into this ladder?`}
								endpoint={`ladder/${ladder.rk}/accept`}
								data={{ user_id: user_id }}
								disabled={!isLadderAdmin(ladder.rk)}
							/>
						{/if}
					{/if}
				{/each}
			</div>
		{:else}
		{#if user_id === caller_id && ladders.length === 0 && teams.length === 0 && groups.length === 0}
			<div class="group">
				<RouteLink
					href="/browse"
					title="Browse"
					description="ladders, teams and groups"
				/>
			</div>
		{/if}
		{/each}

		{#each teams as team (team.rk)}
            <div class="group">
				<RouteLink href={hrefOf(team.rk)} title={team.name} description={team.state === 'pending' ? 'pending club approval' : isTeamMember(team.relation) ? String(team.ext_section_name).toLowerCase() + ' rank ' + team.ext_rank : 'pending'} image={imageOf(team.rk)} />
                {#if team.state === 'active' && team.relation.state === 'pending' && relatedEntities($guids.items, team.rk, 'user').some(user => user.rk === caller_id && isTeamAdmin(user.relation))}
                    <ApiService name="accept" message={`accept ${user_entity.name ?? 'this player'} into this team?`} endpoint="team/accept" data={{ team_id: team.rk, user_id }} />
                {/if}
                {#if isTeamMember(team.relation)}
                    {#each outstandingTeamRounds($guids.items,user_id,team.rk) as round (round.rk)}
                        <RouteLink href={hrefOf(round.rk)} title={round.name} description={`${round.relation.role}`}>
                            {#snippet detail()}<RoundRoleDot role={round.relation.role} />{round.date}{/snippet}
                        </RouteLink>
                    {:else}<HiddenOptions title="No pending or selected rounds" />{/each}
                {/if}
            </div>
        {/each}
		
        {#each groups as group (group.rk)}
            {#if group.relation.is_participant === true || group.relation.state === 'pending'}
                    <RouteLink href={hrefOf(group.rk)} title={group.name} description={group.state === 'pending' ? 'pending club approval' : group.relation.is_participant === true ? 'group' : 'pending'} image={imageOf(group.rk)} />
                    {#if group.state === 'active' && group.relation.state === 'pending' && relatedEntities($guids.items, group.rk, 'user').some(user => user.rk === caller_id && user.relation.is_admin === true)}
                        <ApiService name="accept" message={`Accept ${user_entity.name ?? 'this player'} into this group?`} endpoint={`group/${group.rk}/accept`} data={{user_id}} />
                    {/if}
            {/if}
        {/each}

		<HiddenOptions title="Match History">
		{#each history as match (match.rk)}
			<RouteLink href={hrefOf(match.rk)} title={match.name ?? 'no name'} description={matchSummary($guids.items, match.rk)} />
		{/each}
		</HiddenOptions>
	

	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />user</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
