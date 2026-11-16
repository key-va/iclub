<script lang="ts">
	import { isTeamAdmin, isTeamMember, outstandingTeamRounds } from '#lib/rounds.ts';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import ApiService from '#lib/components/apiService.svelte';
	import UserLadder from '#lib/components/ladders/UserLadder.svelte';
	import { matchSummary, pastMatches } from '#lib/matchSummary.ts';

	const caller_id = $derived($local.caller_id);

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

	const ladders = $derived(relatedEntities($guids.items, user_id, 'ladder'));

	// Finished matches this user played, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(relatedEntities($guids.items, user_id, 'match')).sort((a, b) => b.rk.localeCompare(a.rk))
	);

</script>

<div class="page">
	{#if user_entity}
		<EntityHeader entity={user_entity} />

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
			<UserLadder user={user_entity} {ladder} />
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
