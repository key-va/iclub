<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relationsOf, hrefOf, imageOf, type GuidRow, typeOf, nameOf } from '#lib/stores/guids.ts';
	import {
		roundRoleColour,
		isTeamMember,
		isTeamAdmin,
		availabilityOptions,
		jsonArray,
		officialResult,
		roundView,
		teamView,
		roundLabel,
	} from '#lib/rounds.ts';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import { acceptTeamMember, setRoundRole } from '#lib/stores/remote.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.team_id ?? '');
	const teamEntity = $derived(entityOf(id));
	const team = $derived(teamEntity ? teamView(teamEntity) : undefined);
	const users = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)));
	const mine = $derived(users.find((u) => u.rk === $local.caller_id));
	const myRoundRelations = $derived(
		new Map(
			($local.caller_id ? relationsOf($local.caller_id) : [])
				.map((relation) => [relation.rk, relation]),
		),
	);
	const admin = $derived(isTeamAdmin(mine));
	const club = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'club' && entityOf(row.rk))[0]);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).some(
				(u) => u.rk === $local.caller_id && u.is_admin === true,
			),
	);
	const rounds = $derived(
		relationsOf(id).filter(row => typeOf(row.rk) === 'round' && entityOf(row.rk))
			.map((round) => roundView(entityOf(round.rk)!, round))
			.sort((a, b) => Number(a.number) - Number(b.number)),
	);
	const members = $derived(users.filter((u) => isTeamMember(u)));
	const pending = $derived(users.filter((u) => u.state === 'pending'));
	const standings = $derived(jsonArray(team?.standings));
	const calendar = $derived(jsonArray(team?.calendar));
	function roundSummary(round: GuidRow) {
		if (round.result === 'bye' || round.result === 'washout')
			return String(round.result);
		const mine = round.points_for;
		const theirs = round.points_against;
		if (
			round.state === 'complete' &&
			typeof mine === 'number' &&
			typeof theirs === 'number' &&
			['winner', 'loser', 'draw'].includes(String(round.result))
		) {
			if (round.result === 'draw')
				return `${team?.name} draws ${mine}-${theirs} `;
			const winner = round.result === 'loser' ? round.opponent : team?.name;
			return `${winner} wins ${Math.max(mine, theirs)}-${Math.min(mine, theirs)}`;
		}
		if (round.state === 'complete') return officialResult(round);
		const fixture =
			`${round.is_home === true ? 'home' : round.is_home === false ? 'away' : ''} vs ${round.opponent}`.trim();
		return ['washout', 'postponed'].includes(roundLabel(round))
			? `${fixture} · ${roundLabel(round)}`
			: fixture;
	}
	let syncMessage = $state('');
</script>

<div class="page">
	{#if team}
		<EntityHeader entity={team} />
		{#if team.state === 'pending'}
			<div class="group">
				<HiddenOptions
					inline
					title="Pending"
					description="pending club approval"
				>
					<ApiService
						inline
						name="approve team"
						message={`Approve ${team.name} and import its rounds?`}
						endpoint="team/activate"
						data={{ team_id: id }}
						disabled={!clubAdmin}
					/>
				</HiddenOptions>
			</div>
		{:else if team.state === 'active'}
			{#if admin}
				<div class="group">
					{#each pending as user (user.rk)}
						<RouteLinkHiddenAction
							href={hrefOf(user.rk)}
							title={nameOf(user.rk)}
							description="waiting to join"
							image={imageOf(user.rk)}
						 colour="orange">
							<ActionQuick inline name="accept" action={() => acceptTeamMember(id, user.rk)} />
						</RouteLinkHiddenAction>
					{/each}
				</div>
			{/if}

			<div class="group">
				{#if mine?.state === 'pending'}
					{@const viewer = users.find((user) => user.rk === $local.caller_id)}
					<RouteLink
						href={hrefOf(viewer?.rk ?? '')}
						title={nameOf(viewer?.rk ?? '')}
						description="waiting to join"
						image={imageOf(viewer?.rk ?? '')}
					/>
				{:else if !mine}
					<ApiService
						name="join request"
						message={`Request to join ${team.name}?`}
						endpoint="team/join"
						data={{ team_id: id }}
						disabled={!$local.caller_id}
					/>
				{/if}
				<HiddenOptions title="Future Rounds" badge={rounds.filter(r => !r.result).length}></HiddenOptions>
				{#each rounds.filter(r => !r.result) as round (round.rk)}
					{@const role = myRoundRelations.get(round.rk)?.role}
					{#snippet availabilityActions()}
						{#each availabilityOptions(role) as nextRole}
							<ActionQuick inline name={nextRole} action={() => setRoundRole(round.rk, nextRole)} />
						{/each}
					{/snippet}
					<RouteLinkHiddenAction
						href={hrefOf(round.rk)}
						title={round.name}
						description={role == null ? 'no status' : String(role)}
						children={isTeamMember(mine) && round.state !== 'complete' && availabilityOptions(role).length > 0
							? availabilityActions
							: undefined}
						colour={roundRoleColour[String(role)] ?? 'grey'}>
						{#snippet detail()}{round.is_home ? 'home' : 'away'} {round.date}{/snippet}
					</RouteLinkHiddenAction>
				{/each}

				{#if standings.length}	
					<HiddenOptions title="Leaderboard" badge={standings.length} />
						{#each standings as standing (String(standing.name))}
							<HiddenOptions
								title={String(standing.name)}
								description={`${standing.points} points ${standing.wins} wins`}
								badge={String(standing.rank)}
							>
							</HiddenOptions>
						{/each}
				{/if}
				{#if isTeamMember(mine)}
					<ApiService
						name="refresh data"
						message="Refresh fixtures, results and standings?"
						endpoint="team/sync"
						data={{ team_id: id }}
						onsuccess={(result) => {
							syncMessage = result.message;
						}}
					/>
				{/if}
				{#if syncMessage}
				<div class="row right">
					<p role="status">{syncMessage}</p>
				</div>
				{/if}
				
			</div>	

			<HiddenOptions title="Members">
				{#each members as user (user.rk)}
					<RouteLink
						href={hrefOf(user.rk)}
						title={nameOf(user.rk)}
						description={isTeamAdmin(user)
							? 'administrator'
							: 'member'}
						image={imageOf(user.rk)}
					/>
				{/each}
			</HiddenOptions>

			<HiddenOptions title="Past Rounds">
				{#each rounds.filter(r => r.result) as round (round.rk)}
					<RouteLink
						href={hrefOf(round.rk)}
						title={round.name}
						description={(round.result) + ' ' + (round.ext_points_for ? ` ${round.ext_points_for}` : '0') + ' - ' +(round.ext_points_against ? ` ${round.ext_points_against} ` : '0') + ' points'}
					/>
				{/each}
			</HiddenOptions>

			
		{/if}
	{:else}
		<div class="row right">
			<p>{$guids.loaded ? 'Team not found' : 'Loading…'}</p>
		</div>{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
