<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';
	import { ladderSettings } from '#lib/strings.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id } = $local;

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	// Participants are the users flagged is_participant on their ladder relation, best (lowest) rank first
	const leaderboard = $derived(
		relatedEntities($guids.items, ladderId, 'user')
			.filter((user) => user.relation.is_participant === true)
			.map((user) => ({ ...user, rank: Number(user.relation.rank) }))
			.sort((a, b) => a.rank - b.rank)
	);

	const clubId = $derived(relatedEntities($guids.items, ladderId, 'club')[0]?.rk ?? '');
	const isClubAdmin = $derived(
		relationsOf($guids.items, clubId).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const isMember = $derived(leaderboard.some((player) => player.rk === caller_id));

	let showHelp = $state(false);
</script>

<div class="page">
	{#if ladder}
		<div class="row right">
			<p class="truncate"><strong>{ladder.name}</strong><br />{ladder.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{ladder.rk}.jpg');"></div>
		</div>

		<div class="row right white">
			<div class="leaderboard">
				{#each leaderboard as player (player.rk)}
					<RouteLink
						href={hrefOf(player.rk)}
						title={player.name ?? 'no name'}
						description={`rank ${player.rank}`}
						isWhite={false}
						image={imageOf(player.rk)}
					/>
				{:else}
					<div class="row right">
						<p class="truncate"><strong>No participants</strong><br />leaderboard</p>
						<div class="blank-icon-small"></div>
					</div>
				{/each}
			</div>
		</div>

		{#if showHelp}
			<div class="row left white help">
				<div>
					{#each Object.entries(ladderSettings) as [key, setting] (key)}
						{@const value = String(ladder[key] ?? setting.default)}
						<p>
							<strong>{setting.label}: {value}</strong><br />
							{setting.type === 'enum' ? (setting.values[value] ?? setting.description) : setting.description}
						</p>
					{/each}
				</div>
			</div>
		{/if}

		{#snippet helpButton()}
			<button class="blue" aria-label="help" aria-pressed={showHelp} onclick={() => (showHelp = !showHelp)}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Help">
					<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
					<path d="M12 18h.01" />
				</svg>
			</button>
		{/snippet}

		{#if ladder.state === 'pending' && isClubAdmin}
			<ApiService
				name="accept"
				message={`accept the ladder ${ladder.name} and make it active?`}
				endpoint={`ladder/${ladderId}/activate`}
			>
				{@render helpButton()}
			</ApiService>
		{:else if ladder.state === 'active'}
			<ApiService name="join" message={`join the ladder ${ladder.name}?`} endpoint={`ladder/${ladderId}/join`} disabled={!caller_id || isMember}>
				{@render helpButton()}
			</ApiService>
		{:else}
			<div class="row right">{@render helpButton()}</div>
		{/if}
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />ladder</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
	.help p {
		padding: 0.5em 2em;
	}
	.help > div {
		width: 100%;
	}
	.leaderboard {
		width: 100%;
	}
</style>
