<script lang="ts">
	import TeamActions from './TeamActions.svelte';
	import TeamRound from '#lib/components/teams/TeamRound.svelte';
	import TeamUser from '#lib/components/teams/TeamUser.svelte';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';

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
		roundView
	} from '#lib/components/rounds/roundRules.ts';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import { activateTeam, syncTeam } from '#lib/stores/remote.ts';

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
	const club = $derived(
		relationsOf(id).filter(
			(row) => typeOf(row.rk) === 'club' && entityOf(row.rk)
		)[0]
	);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk)
				.filter(
					(row) =>
						typeOf(row.rk) === 'user' &&
						row.state !== 'left' &&
						entityOf(row.rk)
				)
				.some((u) => u.rk === $local.caller_id && u.is_admin === true)
	);
	const rounds = $derived(
		relationsOf(id)
			.filter((row) => typeOf(row.rk) === 'round' && entityOf(row.rk))
			.map((round) => roundView(entityOf(round.rk)!, round))
			.sort((a, b) => Number(a.number) - Number(b.number))
	);
	const members = $derived(users.filter((u) => isTeamMember(u)));
	const pending = $derived(users.filter((u) => u.state === 'pending'));
	const standings = $derived(jsonArray(team?.standings));
	let syncMessage = $state('');
</script>

{#if team.state === 'pending'}
	<div class="group">
		<HiddenOptions inline title="Pending" description="pending club approval">
			<ActionConfirmation
				inline
				name="approve team"
				message={`Approve ${team.name} and import its rounds?`}
				action={() => activateTeam(id)}
				disabled={!clubAdmin}
			/>
		</HiddenOptions>
	</div>
{:else if team.state === 'active'}
	<TeamActions {team} />
	{#if admin}
		<div class="group">
			{#each pending as user (user.rk)}
				<TeamUser {team} {user} />
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
		{/if}
		<HiddenOptions
			title="Future Rounds"
			badge={rounds.filter((r) => !r.result).length}
		></HiddenOptions>
		{#each rounds.filter((r) => !r.result) as round (round.rk)}
			<TeamRound {team} {round} />
		{/each}

		{#if standings.length}
			<HiddenOptions title="Leaderboard" badge={standings.length} />
			{#each standings as standing (String(standing.name))}
				<HiddenOptions
					title={String(standing.name)}
					description={`${standing.points} points • ${standing.wins} wins`}
					badge={String(standing.rank)}
				></HiddenOptions>
			{/each}
		{/if}
		{#if isTeamMember(mine)}
			<ActionQuick
				name="refresh data"
				action={() => syncTeam(id)}
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
			<TeamUser {team} {user} />
		{/each}
	</HiddenOptions>

	<HiddenOptions title="Past Rounds">
		{#each rounds.filter((r) => r.result) as round (round.rk)}
			<TeamRound {team} {round} past />
		{/each}
	</HiddenOptions>
{/if}
