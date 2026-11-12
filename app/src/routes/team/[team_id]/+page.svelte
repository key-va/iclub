<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		relatedEntities,
		hrefOf,
		imageOf,
	} from '#lib/stores/guids.ts';
	import { isTeamMember, jsonArray, officialResult } from '#lib/rounds.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	const id = $derived(page.params.team_id ?? '');
	const team = $derived(entityOf($guids.items, id));
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
		relatedEntities($guids.items, id, 'round').sort(
			(a, b) => Number(a.number) - Number(b.number),
		),
	);
	const members = $derived(users.filter((u) => isTeamMember(u.relation.role)));
	const pending = $derived(users.filter((u) => u.relation.state === 'pending'));
	const standings = $derived(jsonArray(team?.standings));
	const calendar = $derived(jsonArray(team?.calendar));
	let syncMessage = $state('');
</script>

<div class="page">
	{#if team}
		<div class="row right">
			<p><strong>{team.name}</strong><br />{String(team.state)}</p>
			<div class="blank-icon-small"></div>
		</div>
		<div class="row center">
			<div
				class="round-icon-big"
				style:background-image={`url('${imageOf(id)}')`}
			></div>
		</div>
		<InstallApp />
		<HiddenOptions
			title={String(team.competition_name)}
			description={`${String(team.section_name)} · BRTA`}
		/>
		{#if team.state === 'pending'}
			<HiddenOptions
				title="Pending club approval"
				description="The requesting player will administer this team."
			/>
			{#if clubAdmin}<ApiService
					name="approve team"
					message={`Approve ${team.name} and import its rounds?`}
					endpoint="team/activate"
					data={{ team_id: id }}
				/>{/if}
		{:else if team.state === 'active'}
			{#if $local.caller_id && !mine}<ApiService
					name="request to join"
					message={`Ask to join ${team.name}?`}
					endpoint="team/join"
					data={{ team_id: id }}
				/>{:else if mine?.state === 'pending'}<HiddenOptions
					title="Membership requested"
					description="Waiting for the team administrator"
				/>{/if}
			{#if admin}
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
					</div>{/if}
				{#each pending as user}<div class="group">
						<RouteLink
							href={hrefOf(user.rk)}
							title={user.name}
							description="membership requested"
							image={imageOf(user.rk)}
						/><ApiService
							name="accept player"
							message={`Accept ${user.name}?`}
							endpoint="team/accept"
							data={{ team_id: id, user_id: user.rk }}
						/>
					</div>{/each}
			{/if}
			<div class="group">
				<HiddenOptions
					title="Standings"
					description={team.last_synced
						? `Last refreshed ${new Date(String(team.last_synced)).toLocaleString()}`
						: 'Awaiting first refresh'}
				/>
				{#each standings as standing}<HiddenOptions
						title={`${standing.rank}. ${standing.name}`}
						description={`${standing.wins} wins · ${standing.points} points · ${standing.percentage}%`}
					/>{/each}
			</div>
			<div class="group">
				<HiddenOptions
					title="Rounds"
					badge={rounds.length}
				/>{#each rounds as round}<RouteLink
						href={hrefOf(round.rk)}
						title={round.name}
						description={`${round.date} · ${officialResult(round)}`}
					/>{/each}
			</div>
			{#if calendar.length}<HiddenOptions title="Competition dates"
					>{#each calendar as entry}<HiddenOptions
							title={String(entry.name)}
							description={String(entry.date)}
						/>{/each}</HiddenOptions
				>{/if}
			<div class="group">
				<HiddenOptions
					title="Players"
					badge={members.length}
				/>{#each members as user}<RouteLink
						href={hrefOf(user.rk)}
						title={user.name}
						description={user.relation.role === 'is_admin'
							? 'administrator'
							: 'member'}
						image={imageOf(user.rk)}
					/>{/each}
			</div>
		{/if}
	{:else}<div class="row right">
			<p>{$guids.loaded ? 'Team not found' : 'Loading…'}</p>
		</div>{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
