<script lang="ts">
	import MatchRecord from '#lib/components/matches/MatchRecord.svelte';
	import UserCompetition from '#lib/components/competitions/UserCompetition.svelte';
	import MatchHistory from '#lib/components/matches/MatchHistory.svelte';
	import UserGroup from '#lib/components/groups/UserGroup.svelte';
	import UserTeam from '#lib/components/teams/UserTeam.svelte';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { goto } from '$app/navigation';
	import { clearSession } from '#lib/stores/auth.ts';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		hrefOf,
		imageOf,
		isBrowsableEntity,
		relationsOf,
		typeOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import ActionLink from '#lib/components/ActionLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';

	import UserLadder from '#lib/components/ladders/UserLadder.svelte';

	const caller_id = $derived($local.caller_id);

	const user_id = $derived(page.params.user_id ?? '');
	const user_entity = $derived(entityOf(user_id));
	const relatedRows = $derived(
		relationsOf(user_id).filter((row) => row.state !== 'left')
	);
	const reviewTypes = ['ladder', 'comp', 'team', 'group'];
	const viewingOwnPage = $derived(user_id === caller_id);
	const adminClubs = $derived(viewingOwnPage
		? relatedRows.filter(row => typeOf(row.rk) === 'club' && row.is_admin === true)
		: []);
	const pendingApprovals = $derived([...new Set(adminClubs.flatMap(club =>
		relationsOf(club.rk).map(row => row.rk)
	))]
		.map(id => entityOf(id))
		.filter((row): row is GuidRow => row?.state === 'pending' && reviewTypes.includes(row.pk))
		.sort((first, second) => String(first.name).localeCompare(String(second.name))));
	const pendingCreations = $derived(viewingOwnPage
		? relatedRows
			.filter(row => row.is_admin === true && reviewTypes.includes(typeOf(row.rk)))
			.map(row => entityOf(row.rk))
			.filter((row): row is GuidRow => row?.state === 'pending' && !pendingApprovals.some(item => item.rk === row.rk))
		: []);
	const activeMemberships = $derived(relatedRows.filter((row) => isBrowsableEntity(entityOf(row.rk))));
	const groups = $derived(activeMemberships.filter((row) => typeOf(row.rk) === 'group'));
	const competitions = $derived(activeMemberships.filter((row) =>
		typeOf(row.rk) === 'comp' && (row.is_admin === true || row.state !== 'closed')
	));
	const teams = $derived(activeMemberships.filter((row) => typeOf(row.rk) === 'team'));
	const ladders = $derived(activeMemberships.filter((row) => typeOf(row.rk) === 'ladder'));

	async function logout() {
		await clearSession();
		await goto('/login');
	}
</script>

<div class="page">
	{#if user_entity}
		<EntityHeader entity={user_entity} />
		<MatchRecord parentId={user_id} />

		{#if adminClubs.length}
			<div class="group">
				<HiddenOptions title="Pending Approval" badge={pendingApprovals.length} />
				{#each pendingApprovals as entity (entity.rk)}
					<RouteLink href={hrefOf(entity.rk)} title={entity.name} description={entity.pk}
						image={imageOf(entity.rk)} />
				{/each}
			</div>
		{/if}

		{#each pendingCreations as entity (entity.rk)}
			<RouteLink href={hrefOf(entity.rk)} title={entity.name} description="pending club approval"
				image={imageOf(entity.rk)} isWhite />
		{/each}

		{#each ladders as ladder (ladder.rk)}
			<UserLadder user={user_entity} ladder={entityOf(ladder.rk)!} />
		{:else}
			{#if viewingOwnPage && pendingCreations.length === 0 && ladders.length === 0 && teams.length === 0 && groups.length === 0 && competitions.length === 0}
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

		{#if viewingOwnPage}
			<HiddenOptions inline title="More Options">
				<button class="blue" aria-label="logout" onclick={logout}>
					<p>logout</p>
				</button>
				<ActionLink href={`${hrefOf(user_id)}/edit`} />
			</HiddenOptions>
		{/if}
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
