<script lang="ts">
	import { matchFormatSetting } from '#lib/components/ladders/ladderSettings.ts';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { entityOf, guids, hrefOf, imageOf, nameOf, relationsOf, typeOf } from '#lib/stores/guids.ts';
	import { acceptCompetitionPair, competitionEntry } from '#lib/stores/remote.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import EntryRequests from '#lib/components/EntryRequests.svelte';
	import EntityActions from '#lib/components/EntityActions.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import UserMatch from '#lib/components/matches/UserMatch.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import { activeCompetitionMatches, competitionPlayerMatches, competitionPlayerStatus } from '#lib/components/competitions/competitionPlayers.ts';
	import { competitionChampion, competitionRounds, roundMatches } from '#lib/components/competitions/competitionBracket.ts';
	import { matchSummary } from '#lib/components/matches/matchRules.ts';

	const id = $derived(page.params.comp_id ?? '');
	const elim = $derived(entityOf(id));
	const matchFormat = $derived(String(elim?.match_format ?? matchFormatSetting.default).replaceAll('_', ' '));
	const links = $derived(relationsOf(id));
	const caller = $derived($local.caller_id);
	const mine = $derived(links.find((row) => row.rk === caller));
	const admin = $derived(mine?.is_admin === true);
	const canApprove = $derived(links.some((row) =>
		typeOf(row.rk) === 'club' && relationsOf(row.rk).some((link) => link.rk === caller && link.is_admin === true)
	));
	const doubles = $derived(elim?.format === 'doubles');
	const open = $derived(elim?.state === 'open');
	const drawing = $derived(elim?.state === 'drawing');
	const drawReady = $derived(elim?.state === 'active' || elim?.state === 'complete');
	const status = $derived.by(() => {
		if (elim?.state === 'pending') return 'awaiting club approval';
		if (open) return 'entries open';
		if (drawing) return 'draw in progress';
		return elim?.state === 'complete' ? 'complete' : 'draw underway';
	});
	const canJoin = $derived(open && !!caller && mine?.is_participant !== true && mine?.state !== 'pending');
	const canLeave = $derived(open && (mine?.is_participant === true || mine?.state === 'pending'));
	const canDraw = $derived(admin && (open || drawing));
	const entrants = $derived(
		links.filter((row) => typeOf(row.rk) === (doubles ? 'pair' : 'user') && row.is_participant === true)
			.sort((a, b) => nameOf(a.rk).localeCompare(nameOf(b.rk)))
	);
	const seeds = $derived(entrants.filter((row) => Number(row.seed) > 0)
		.sort((a, b) => Number(a.seed) - Number(b.seed)));
	const requests = $derived(links.filter((row) => typeOf(row.rk) === 'user' && row.state === 'pending'));
	const rounds = $derived(competitionRounds(id));
	const champion = $derived(elim ? competitionChampion(elim) : '');
	const yourMatches = $derived(caller
		? activeCompetitionMatches(competitionPlayerMatches(id, caller))
		: []);
	const byes = $derived(2 ** Math.ceil(Math.log2(Math.max(entrants.length, 2))) - entrants.length);
	const drawMessage = $derived(drawing
		? 'Resume the draw?'
		: `Start the draw with ${entrants.length} entrants and ${byes} byes? ${requests.length ? `${requests.length} pending requests will close. ` : ''}${seeds.length ? `Seeds: ${seeds.map((row) => `#${row.seed} ${nameOf(row.rk)}`).join(', ')}.` : 'No seeds assigned.'}`);
</script>

<div class="page">
	{#if elim && (elim.comp_system ?? elim.competition_type) === 'elimination'}
		<EntityHeader entity={elim} />
		<EntityActions section="primary" summary={`elimination • ${doubles ? 'doubles' : 'singles'} • ${matchFormat} • ${status}`}>
			{#if elim.state === 'pending' && canApprove}
				<ActionConfirmation inline arrow showLabel name="approve" message={`Approve ${elim.name}?`}
					action={() => competitionEntry(id, 'activate')} />
			{:else if canJoin}
				<ActionConfirmation inline arrow showLabel name="request to join" message={`Request to join ${elim.name}?`}
					action={() => competitionEntry(id, 'join')} />
			{/if}
		</EntityActions>

		{#if open && admin && requests.length}
			<EntryRequests pending={requests} {doubles} acceptLabel={(playerId) => `Accept ${nameOf(playerId)}`}
				acceptPlayer={(playerId) => competitionEntry(id, 'accept', playerId)}
				acceptPair={(ids) => acceptCompetitionPair(id, ids)} />
		{:else if open && mine?.state === 'pending'}
			<div class="group">
				<RouteLink href={hrefOf(mine.rk)} title={nameOf(mine.rk)}
					image={imageOf(mine.rk)} description="join request pending" />
			</div>
		{/if}

		<div class="group">
			{#if drawReady}
				{#each yourMatches as match (match.rk)}
					<UserMatch {match} />
				{/each}
			{/if}
			<HiddenOptions title={doubles ? 'Pairs' : 'Players'} badge={entrants.length} />
			{#each entrants as row (row.rk)}
				{@const ranked = Number(row.seed) > 0}
				{@const canRank = open && admin && (ranked || seeds.length < 8)}
				{@const description = competitionPlayerStatus(row, competitionPlayerMatches(id, row.rk), row.rk === champion)}
				<RouteLinkHiddenAction href={hrefOf(row.rk)} title={nameOf(row.rk)}
					image={imageOf(row.rk)} {description}
					colour={description === 'champion' ? 'green' : description === 'eliminated' ? 'red' : ranked ? 'blue' : 'grey'}>
					{#if canRank}
						<ActionQuick inline name={ranked ? 'unrank' : 'rank'}
							label={ranked ? `Unrank ${nameOf(row.rk)}` : `Rank ${nameOf(row.rk)}`}
							action={() => competitionEntry(id, ranked ? 'unseed' : 'seed', row.rk)} />
					{:else}
						<button type="button" class="grey" disabled><p>{description}</p></button>
					{/if}
				</RouteLinkHiddenAction>
			{/each}
		</div>

		{#if drawReady}
			{#each rounds as { entity: round } (round.rk)}
				<HiddenOptions title={round.name}>
					{#each roundMatches(round.rk) as { entity: match } (match.rk)}
						<RouteLink href={hrefOf(match.rk)} title={match.name} isWhite={match.state === 'active'}
							description={match.state === 'bye' ? 'bye' : matchSummary(match.rk) || (match.state === 'waiting' ? 'awaiting players' : 'ready to play')}
						/>
					{/each}
				</HiddenOptions>
			{/each}
		{/if}

		{#if canLeave || canDraw}
			<EntityActions section="options">
				{#snippet options()}
					{#if canLeave}
						<ActionConfirmation inline name={mine?.state === 'pending' ? 'cancel request' : 'withdraw'}
							message={mine?.state === 'pending' ? 'Cancel your join request?' : doubles ? 'Withdraw your pair? Your partner will return to the pending list.' : 'Withdraw your entry?'}
							action={() => competitionEntry(id, 'leave')} />
					{/if}
					{#if canDraw}
						<ActionConfirmation inline name={drawing ? 'resume draw' : 'start draw'} message={drawMessage}
							action={() => competitionEntry(id, 'draw')} disabled={!drawing && entrants.length < 2} />
					{/if}
				{/snippet}
			</EntityActions>
		{/if}
	{:else if elim}
		<EntityHeader entity={elim} />
		<p>This competition type is unavailable.</p>
	{:else}
		<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>
	{/if}
</div>
