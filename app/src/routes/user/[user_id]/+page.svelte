<script lang="ts">
	import UserCompetition from '#lib/components/competitions/UserCompetition.svelte';
	import MatchHistory from '#lib/components/matches/MatchHistory.svelte';
	import UserGroup from '#lib/components/groups/UserGroup.svelte';
	import UserTeam from '#lib/components/teams/UserTeam.svelte';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		hrefOf,
		imageOf,
		relationsOf,
		typeOf,
		nameOf
	} from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	import UserLadder from '#lib/components/ladders/UserLadder.svelte';

	const caller_id = $derived($local.caller_id);

	const user_id = $derived(page.params.user_id ?? '');
	const user_entity = $derived(entityOf(user_id));
	const relatedRows = $derived(
		relationsOf(user_id).filter((row) => row.state !== 'left')
	);
	const adminClubs = $derived(
		relatedRows.filter(
			(row) => typeOf(row.rk) === 'club' && row.is_admin === true
		)
	);
	const pendingApprovalLadders = $derived(
		adminClubs.flatMap((club) =>
			relationsOf(club.rk)
				.filter((row) => typeOf(row.rk) === 'ladder' && entityOf(row.rk))
				.filter((ladder) => entityOf(ladder.rk)?.state === 'pending')
		)
	);

	const groups = $derived(
		relatedRows.filter((row) => typeOf(row.rk) === 'group' && entityOf(row.rk))
	);
	const pendingGroups = $derived(
		adminClubs.flatMap((club) =>
			relationsOf(club.rk)
				.filter((row) => typeOf(row.rk) === 'group' && entityOf(row.rk))
				.filter((group) => entityOf(group.rk)?.state === 'pending')
		)
	);
	const competitions = $derived(
		relationsOf(user_id).filter((row) => typeOf(row.rk) === 'comp' && entityOf(row.rk) &&
			(row.is_admin === true || !['left', 'closed'].includes(String(row.state))))
	);
	const pendingCompetitions = $derived(
		adminClubs.flatMap((club) => relationsOf(club.rk)
			.filter((row) => typeOf(row.rk) === 'comp' && entityOf(row.rk)?.state === 'pending'))
	);
	const teams = $derived(
		relatedRows.filter((row) => typeOf(row.rk) === 'team' && entityOf(row.rk))
	);
	const pendingTeams = $derived(
		adminClubs.flatMap((club) =>
			relationsOf(club.rk)
				.filter((row) => typeOf(row.rk) === 'team' && entityOf(row.rk))
				.filter((team) => entityOf(team.rk)?.state === 'pending')
		)
	);

	const ladders = $derived(
		relatedRows.filter((row) => typeOf(row.rk) === 'ladder' && entityOf(row.rk))
	);

	// Finished matches this user played, newest first (IDs embed their creation time)
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
			{#each pendingTeams as team}<RouteLink
					href={hrefOf(team.rk)}
					title={nameOf(team.rk)}
					description="pending club approval"
					image={imageOf(team.rk)}
				/>{/each}
			{#each pendingCompetitions as elim (elim.rk)}
				<RouteLink href={hrefOf(elim.rk)} title={nameOf(elim.rk)}
					description="pending club approval" image={imageOf(elim.rk)} isWhite />
			{/each}
			{#each pendingGroups as group (group.rk)}<RouteLink
					href={hrefOf(group.rk)}
					title={nameOf(group.rk)}
					description="pending club approval"
					image={imageOf(group.rk)}
				/>{/each}
		{/if}

		{#each ladders as ladder (ladder.rk)}
			<UserLadder user={user_entity} ladder={entityOf(ladder.rk)!} />
		{:else}
			{#if user_id === caller_id && ladders.length === 0 && teams.length === 0 && groups.length === 0 && competitions.length === 0}
				<div class="group">
					<RouteLink
						href="/browse"
						title="Browse"
						description="ladders, teams, groups and competitions"
					/>
				</div>
			{/if}
		{/each}

		{#each teams as team (team.rk)}
			<UserTeam user={user_entity} {team} />
		{/each}

		{#each groups as group (group.rk)}
			<UserGroup user={user_entity} {group} />
		{/each}

		{#each competitions as competition (competition.rk)}
			<UserCompetition user={user_entity} {competition} />
		{/each}

		<MatchHistory parentId={user_id} />
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />user
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
