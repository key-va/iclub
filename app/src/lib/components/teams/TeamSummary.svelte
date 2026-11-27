<script lang="ts">
	import TeamActions from './TeamActions.svelte';
	import TeamRound from '#lib/components/teams/TeamRound.svelte';
	import TeamUser from '#lib/components/teams/TeamUser.svelte';

	import { local } from '#lib/stores/local.ts';
	import {
		type GuidRow,
		entityOf,
		relationsOf,
		hrefOf,
		imageOf,
		typeOf,
		nameOf
	} from '#lib/stores/guids.ts';
	import {
		isTeamMember,
		isTeamAdmin,
		jsonArray,
		roundView,
		teamView
	} from '#lib/components/rounds/roundRules.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	let { team }: { team: GuidRow } = $props();
	const id = $derived(team.rk);
	const users = $derived(
		relationsOf(id).filter(
			(row) =>
				typeOf(row.rk) === 'user' && row.state !== 'left' && entityOf(row.rk)
		)
	);
	const mine = $derived(users.find((u) => u.rk === $local.caller_id));
	const admin = $derived(isTeamAdmin(mine));
	const rounds = $derived(
		relationsOf(id)
			.filter((row) => typeOf(row.rk) === 'round' && entityOf(row.rk))
			.map((round) => roundView(entityOf(round.rk)!, round))
			.sort(
				(a, b) =>
					Number(a.number ?? Infinity) - Number(b.number ?? Infinity) ||
					String(a.date).localeCompare(String(b.date))
			)
	);
	const futureRounds = $derived(rounds.filter((round) => !round.result));
	const finalsDates = $derived(
		jsonArray(team.ext_calendar)
			.filter(
				(entry): entry is { name: string; date: string } =>
					(entry?.name === 'Semi Final' || entry?.name === 'Grand Final') &&
					!rounds.some((round) => round.ext_stage === entry.name) &&
					typeof entry.date === 'string' &&
					/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
			)
			.sort((a, b) => a.date.localeCompare(b.date))
	);
	const members = $derived(users.filter((u) => isTeamMember(u)));
	const pending = $derived(users.filter((u) => u.state === 'pending'));
	const standings = $derived(jsonArray(teamView(team).standings));
	const nextRound = $derived(futureRounds.find((round) =>
		round.state !== 'complete' && round.state !== 'eliminated' &&
		typeof round.opponent === 'string' && !!round.opponent
	));
	const laterRounds = $derived(futureRounds.filter((round) => round.rk !== nextRound?.rk));
</script>

<TeamActions {team} section="primary" />
{#if team.state === 'active'}
	{#if admin && pending.length}
		<div class="group">
			{#each pending as user (user.rk)}
				<TeamUser {team} {user} />
			{/each}
		</div>
	{/if}

	{#if mine?.state === 'pending'}
		<div class="group">
			<RouteLink
				href={hrefOf(mine.rk)}
				title={nameOf(mine.rk)}
				description="waiting to join"
				image={imageOf(mine.rk)}
			/>
		</div>
	{/if}

	{#if nextRound}<TeamRound {team} round={nextRound} featured />{/if}
	{#if standings.length}
		<div class="group">
			<HiddenOptions title="Leaderboard" badge={standings.length} />
			{#each standings as standing (String(standing.name))}
				<HiddenOptions
					title={String(standing.name)}
					description={`${standing.points} points • ${standing.wins} wins`}
					badge={String(standing.rank)}
				></HiddenOptions>
			{/each}
		</div>
	{/if}

	<div class="group">
		<HiddenOptions title="Future Rounds" badge={laterRounds.length + finalsDates.length} />
		{#each laterRounds as round (round.rk)}
			{#if round.state === 'eliminated'}
				<HiddenOptions title={round.name} description={`eliminated • ${round.date}`} />
			{:else}
				<TeamRound {team} {round} />
			{/if}
		{/each}

		{#each finalsDates as final}
			<HiddenOptions title={final.name} description={`pending • ${final.date}`} />
		{/each}
	</div>

	<HiddenOptions title="Team Members">
		{#each members as user (user.rk)}
			<TeamUser {team} {user} />
		{/each}
	</HiddenOptions>

	<HiddenOptions title="Past Rounds">
		{#each rounds.filter((r) => r.result) as round (round.rk)}
			<TeamRound {team} {round} past />
		{/each}
	</HiddenOptions>
{/if}

<TeamActions {team} section="options" />
