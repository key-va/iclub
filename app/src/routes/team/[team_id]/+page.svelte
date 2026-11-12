<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		relatedEntities,
		hrefOf,
		imageOf,
		type GuidRow,
	} from '#lib/stores/guids.ts';
	import {
		isTeamMember,
		jsonArray,
		officialResult,
		roundView,
		teamView,
		roundLabel,
	} from '#lib/rounds.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	const id = $derived(page.params.team_id ?? '');
	const teamEntity = $derived(entityOf($guids.items, id));
	const team = $derived(teamEntity ? teamView(teamEntity) : undefined);
	const users = $derived(relatedEntities($guids.items, id, 'user'));
	const mine = $derived(users.find((u) => u.rk === $local.caller_id)?.relation);
	const admin = $derived(mine?.role === 'is_admin');
	const club = $derived(relatedEntities($guids.items, id, 'club')[0]);
	const clubAdmin = $derived(
		!!club &&
			relatedEntities($guids.items, club.rk, 'user').some(
				(u) => u.rk === $local.caller_id && u.relation.is_admin === true,
			),
	);
	const rounds = $derived(
		relatedEntities($guids.items, id, 'round')
			.map(roundView)
			.sort((a, b) => Number(a.number) - Number(b.number)),
	);
	const members = $derived(users.filter((u) => isTeamMember(u.relation.role)));
	const pending = $derived(users.filter((u) => u.relation.state === 'pending'));
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
			`${round.home_away === 'home' ? 'home' : round.home_away === 'away' ? 'away' : ''} vs ${round.opponent}`.trim();
		return ['washout', 'postponed'].includes(roundLabel(round))
			? `${fixture} · ${roundLabel(round)}`
			: fixture;
	}
	let syncMessage = $state('');
</script>

<div class="page">
	{#if team}
		<div class="row right">
			<p class="truncate"><strong>{team.name}</strong><br />{team.pk}</p>
			<div class="blank-icon-small"></div>
		</div>
		<div class="row center">
			<div
				class="round-icon-big"
				style:background-image={`url('${imageOf(id)}')`}
			></div>
		</div>
		<InstallApp />
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
						<RouteLink
							href={hrefOf(user.rk)}
							title={user.name}
							description="waiting to join"
							image={imageOf(user.rk)}
						>
							<ApiService
								inline
								name="accept"
								message={`Accept ${user.name} onto the team?`}
								endpoint="team/accept"
								data={{ team_id: id, user_id: user.rk }}
							/>
						</RouteLink>
					{/each}
				</div>
			{/if}

			<div class="group">
				{#if mine?.state === 'pending'}
					{@const viewer = users.find((user) => user.rk === $local.caller_id)}
					<RouteLink
						href={hrefOf(viewer?.rk ?? '')}
						title={viewer?.name}
						description="waiting to join"
						image={imageOf(viewer?.rk ?? '')}
					/>
				{:else if !mine}
					<ApiService
						name="join"
						message={`Ask to join ${team.name}?`}
						endpoint="team/join"
						data={{ team_id: id }}
						disabled={!$local.caller_id}
					/>
				{/if}
				<HiddenOptions title="Members" badge={members.length} />
				{#each members as user (user.rk)}
					<RouteLink
						href={hrefOf(user.rk)}
						title={user.name}
						description={user.relation.role === 'is_admin'
							? 'administrator'
							: 'member'}
						image={imageOf(user.rk)}
					/>
				{/each}
				<ApiService
					name="refresh TROLS"
					message="Refresh the official fixtures, results and standings?"
					endpoint="team/sync"
					data={{ team_id: id }}
					onsuccess={(result) => {
						syncMessage = result.message;
					}}
				/>
				{#if syncMessage}<div class="row right">
						<p role="status">{syncMessage}</p>
					</div>
				{/if}
			</div>

			{#if standings.length}
				<div class="group">
					{#each standings as standing (String(standing.name))}
						<HiddenOptions
							title={String(standing.name)}
							description={`${standing.wins} wins`}
							badge={String(standing.rank)}
						>
							{#snippet detail()}
								<span class="dot" aria-hidden="true"></span>{standing.points} points
							{/snippet}
						</HiddenOptions>
					{/each}
				</div>
			{/if}

			<HiddenOptions title="Rounds">
				{#each rounds as round (round.rk)}
					<RouteLink
						href={hrefOf(round.rk)}
						title={`Round ${round.number} ${round.date}`}
						description={roundSummary(round)}
					/>
				{/each}
			</HiddenOptions>
		{/if}
	{:else}<div class="row right">
			<p>{$guids.loaded ? 'Team not found' : 'Loading…'}</p>
		</div>{/if}
</div>

<style>
	.dot {
		display: inline-block;
		width: 0.5em;
		height: 0.5em;
		margin: 0 0.5em;
		border-radius: 50%;
		background: grey;
	}
	.page {
		width: 100%;
	}
</style>
