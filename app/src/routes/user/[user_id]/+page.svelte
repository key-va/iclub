<script lang="ts">
	import { isTeamAdmin, isTeamMember, outstandingTeamRounds, roundView } from '#lib/rounds.ts';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, hrefOf, imageOf, relationsOf, typeOf, nameOf } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import ApiService from '#lib/components/apiService.svelte';
	import UserLadder from '#lib/components/ladders/UserLadder.svelte';
	import { matchSummary, pastMatches } from '#lib/matchSummary.ts';

	const caller_id = $derived($local.caller_id);

	const user_id = $derived(page.params.user_id ?? '');
	const user_entity = $derived(entityOf(user_id));
	const relatedRows = $derived(relationsOf(user_id));
	const adminClubs = $derived(relatedRows.filter(row => typeOf(row.rk) === 'club' && row.is_admin === true));
	const pendingApprovalLadders = $derived(
		adminClubs.flatMap((club) =>
			relationsOf(club.rk).filter(row => typeOf(row.rk) === 'ladder' && entityOf(row.rk)).filter((ladder) => entityOf(ladder.rk)?.state === 'pending')
		)
	);

    const groups = $derived(relatedRows.filter(row => typeOf(row.rk) === 'group' && entityOf(row.rk)));
    const pendingGroups = $derived(adminClubs.flatMap(club => relationsOf(club.rk).filter(row => typeOf(row.rk) === 'group' && entityOf(row.rk)).filter(group => entityOf(group.rk)?.state === 'pending')));
    const teams = $derived(relatedRows.filter(row => typeOf(row.rk) === 'team' && entityOf(row.rk)));
    const pendingTeams = $derived(adminClubs.flatMap(club => relationsOf(club.rk).filter(row => typeOf(row.rk) === 'team' && entityOf(row.rk)).filter(team => entityOf(team.rk)?.state === 'pending')));

	const ladders = $derived(relatedRows.filter(row => typeOf(row.rk) === 'ladder' && entityOf(row.rk)));

	// Finished matches this user played, newest first (IDs embed their creation time)
	const history = $derived(
		pastMatches(relatedRows.filter(row => typeOf(row.rk) === 'match' && entityOf(row.rk))).sort((a, b) => b.rk.localeCompare(a.rk))
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
						title={nameOf(ladder.rk)}
						description="pending club approval"
						isWhite={false}
						image={imageOf(ladder.rk)}
					/>
				{/each}
			</div>
		{/if}

        {#if user_id === $local.caller_id}
            {#each pendingTeams as team}<RouteLink href={hrefOf(team.rk)} title={nameOf(team.rk)} description="pending club approval" image={imageOf(team.rk)} />{/each}
            {#each pendingGroups as group (group.rk)}<RouteLink href={hrefOf(group.rk)} title={nameOf(group.rk)} description="pending club approval" image={imageOf(group.rk)} isWhite={true} />{/each}
        {/if}

		{#each ladders as ladder (ladder.rk)}
			<UserLadder user={user_entity} ladder={entityOf(ladder.rk)!} />
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
				<RouteLink href={hrefOf(team.rk)} title={nameOf(team.rk)} description={entityOf(team.rk)?.state === 'pending' ? 'pending club approval' : isTeamMember(team) ? String(entityOf(team.rk)?.ext_section_name).toLowerCase() + ' rank ' + entityOf(team.rk)?.ext_rank : 'pending'} image={imageOf(team.rk)} />
                {#if entityOf(team.rk)?.state === 'active' && team.state === 'pending' && relationsOf(team.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).some(user => user.rk === caller_id && isTeamAdmin(user))}
                    <ApiService name="accept" message={`accept ${user_entity.name ?? 'this player'} into this team?`} endpoint="team/accept" data={{ team_id: team.rk, user_id }} />
                {/if}
                {#if isTeamMember(team)}
                    {#each outstandingTeamRounds(user_id, team.rk) as round (round.rk)}
                        <RouteLink href={hrefOf(round.rk)} title={nameOf(round.rk)} description={`${round.role}`}>
                            {#snippet detail()}<RoundRoleDot role={round.role} />{roundView(entityOf(round.rk)!).date}{/snippet}
                        </RouteLink>
                    {:else}<HiddenOptions title="No pending or selected rounds" />{/each}
                {/if}
            </div>
        {/each}
		
        {#each groups as group (group.rk)}
            {#if group.is_participant === true || group.state === 'pending'}
                    <RouteLink href={hrefOf(group.rk)} title={nameOf(group.rk)} description={entityOf(group.rk)?.state === 'pending' ? 'pending club approval' : group.is_participant === true ? 'group' : 'pending'} image={imageOf(group.rk)} />
                    {#if entityOf(group.rk)?.state === 'active' && group.state === 'pending' && relationsOf(group.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).some(user => user.rk === caller_id && user.is_admin === true)}
                        <ApiService name="accept" message={`Accept ${user_entity.name ?? 'this player'} into this group?`} endpoint={`group/${group.rk}/accept`} data={{user_id}} />
                    {/if}
            {/if}
        {/each}

		<HiddenOptions title="Match History">
		{#each history as match (match.rk)}
			<RouteLink href={hrefOf(match.rk)} title={nameOf(match.rk)} description={matchSummary(match.rk)} />
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
