<script lang="ts">
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import { matchFormatSetting } from '#lib/components/ladders/ladderSettings.ts';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { entityOf, guids, hrefOf, imageOf, nameOf, relationsOf, typeOf } from '#lib/stores/guids.ts';
	import { acceptCompetitionPair, competitionEntry } from '#lib/stores/remote.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import ActionLink from '#lib/components/ActionLink.svelte';
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
	import { roundRobinStandings, roundRobinStandingDescription } from '#lib/components/competitions/roundRobinStandings.ts';
	import { matchSummary } from '#lib/components/matches/matchRules.ts';

	const id = $derived(page.params.comp_id ?? '');
	const elim = $derived(entityOf(id));
	const matchFormat = $derived(String(elim?.match_format ?? matchFormatSetting.default).replaceAll('_', ' '));
	const links = $derived(relationsOf(id));
	const pairIcon = $derived(imageOf(links.find((row) => typeOf(row.rk) === 'club')?.rk ?? id));
	const caller = $derived($local.caller_id);
	const mine = $derived(links.find((row) => row.rk === caller));
	const admin = $derived(mine?.is_admin === true);
	const club = $derived(links.find((row) => typeOf(row.rk) === 'club')?.rk ?? elim?.rejection_club);
	const canApprove = $derived(typeof club === 'string' &&
		relationsOf(club).some((link) => link.rk === caller && link.is_admin === true)
	);
	const roundRobin = $derived(elim?.comp_system === 'round_robin');
	const standings = $derived(roundRobin ? roundRobinStandings(id) : []);
	const doubles = $derived(elim?.format === 'doubles');
	const canEdit = $derived(admin && elim?.state === 'pending');
	const open = $derived(elim?.state === 'open');
	const drawing = $derived(elim?.state === 'drawing');
	const drawReady = $derived(elim?.state === 'active' || elim?.state === 'complete');
	const status = $derived.by(() => {
		if (elim?.state === 'rejected') return 'creation request rejected';
		if (elim?.state === 'pending') return 'awaiting club approval';
		if (open) return 'entries open';
		if (drawing) return 'draw in progress';
		return elim?.state === 'complete' ? 'complete' : 'draw underway';
	});
	const canJoin = $derived(open && mine?.is_participant !== true);
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
	const champion = $derived(elim && !roundRobin ? competitionChampion(elim) : '');
	const yourMatches = $derived(caller
		? activeCompetitionMatches(competitionPlayerMatches(id, caller))
		: []);
	const byes = $derived(2 ** Math.ceil(Math.log2(Math.max(entrants.length, 2))) - entrants.length);
	const drawMessage = $derived(drawing
		? 'Resume the draw?'
		: roundRobin
			? `Start the draw with ${entrants.length} entrants, ${entrants.length - 1 + entrants.length % 2} rounds and ${entrants.length * (entrants.length - 1) / 2} matches? ${requests.length ? `${requests.length} pending requests will close.` : ''}`
			: `Start the draw with ${entrants.length} entrants and ${byes} byes? ${requests.length ? `${requests.length} pending requests will close. ` : ''}${seeds.length ? `Seeds: ${seeds.map((row) => `#${row.seed} ${nameOf(row.rk)}`).join(', ')}.` : 'No seeds assigned.'}`);
</script>

<div class="page">
	{#if elim && (roundRobin || (elim.comp_system ?? elim.competition_type) === 'elimination')}
		<EntityHeader entity={elim} />
		<EntityActions section="primary" summary={`${roundRobin ? 'round robin' : 'elimination'} • ${doubles ? 'doubles' : 'singles'} • ${matchFormat} • ${status}`}>
			{#if elim.state === 'pending' && canApprove}
				<RejectCreationRequest {id} />
				<ActionConfirmation inline arrow showLabel name="approve" message={`approve ${elim.name}?`}
					action={() => competitionEntry(id, 'activate')} />
			{:else if elim.state === 'rejected' && elim.rejection_club && canApprove}
				<RejectCreationRequest {id} resuming />
			{:else if canJoin}
				<ActionConfirmation inline arrow showLabel name="request to join" message={`request to join ${elim.name}?`}
					action={() => competitionEntry(id, 'join')} disabled={!caller || mine?.state === 'pending'} />
			{/if}
		</EntityActions>

		{#if open && admin && requests.length}
			<EntryRequests entityId={id} pending={requests} {doubles} acceptLabel={(playerId) => `Accept ${nameOf(playerId)}`}
				description={roundRobin ? undefined : "unranked • pending"}
				acceptPlayer={(playerId) => competitionEntry(id, 'accept', playerId)}
				acceptPair={(ids) => acceptCompetitionPair(id, ids)} />
		{:else if open && mine?.state === 'pending'}
			<div class="group">
				<RouteLink href={hrefOf(mine.rk)} title={nameOf(mine.rk)}
					image={imageOf(mine.rk)} description={roundRobin ? "join request pending" : "unranked • pending"} />
			</div>
		{/if}

		<div class="group">
			{#if drawReady}
				{#each yourMatches as match (match.rk)}
					<UserMatch {match} />
				{/each}
			{/if}
			{#if roundRobin}
				<HiddenOptions title="Standings" badge={standings.length} />
				{#each standings as standing (standing.entry.rk)}
					{@const { entry } = standing}
					<RouteLink href={hrefOf(entry.rk)} title={nameOf(entry.rk)} image={doubles ? pairIcon : imageOf(entry.rk)}
						description={roundRobinStandingDescription(standing, elim.state === 'complete')} />
				{/each}
			{:else}
				<HiddenOptions title={doubles ? 'Pairs' : 'Players'} badge={entrants.length} />
				{#each entrants as row (row.rk)}
					{@const ranked = Number(row.seed) > 0}
					{@const playerStatus = competitionPlayerStatus(row, competitionPlayerMatches(id, row.rk), row.rk === champion)}
					{@const status = playerStatus === 'champion' || playerStatus === 'eliminated' ? playerStatus : drawReady ? 'active' : 'pending'}
					{@const description = `${ranked ? `rank ${row.seed}` : 'unranked'} • ${status}`}
					{#snippet rankActions()}
						<ActionQuick inline name="rank" label={`Rank ${nameOf(row.rk)}`}
							disabled={!open || ranked || seeds.length >= 8}
							action={() => competitionEntry(id, 'seed', row.rk)} />
						<ActionQuick inline name="unrank" label={`Unrank ${nameOf(row.rk)}`}
							disabled={!open || !ranked}
							action={() => competitionEntry(id, 'unseed', row.rk)} />
					{/snippet}
					<RouteLinkHiddenAction href={hrefOf(row.rk)} title={nameOf(row.rk)}
						image={doubles ? pairIcon : imageOf(row.rk)} {description}
						currentSelection={admin ? undefined : 'no actions'}
						colour={status === 'champion' ? 'green' : status === 'eliminated' ? 'red' : ranked ? 'orange' : 'blue'}
						children={admin ? rankActions : undefined} />
				{/each}
			{/if}
		</div>

		{#if drawReady}
			{#each rounds as { entity: round } (round.rk)}
				<HiddenOptions title={round.name}>
					{#if roundRobin}
						{@const bye = relationsOf(round.rk).find((row) => row.role === 'bye')}
						{#if bye}<HiddenOptions title={nameOf(bye.rk)} description="bye" />{/if}
					{/if}
					{#each roundMatches(round.rk) as { entity: match } (match.rk)}
						<RouteLink href={hrefOf(match.rk)} title={match.name} isWhite={match.state === 'active'}
							description={match.state === 'bye' ? 'bye' : match.state === 'waiting' ? (roundRobin ? 'scheduled' : 'awaiting players') : matchSummary(match.rk) || 'ready to play'}
						/>
					{/each}
				</HiddenOptions>
			{/each}
		{/if}

		{#if canLeave || canDraw || canEdit}
			<EntityActions section="options">
				{#snippet options()}
					{#if canLeave}
						<ActionConfirmation inline name={mine?.state === 'pending' ? 'cancel request' : 'withdraw'}
							message={mine?.state === 'pending' ? 'Cancel your join request?' : 'Withdraw your entry?'}
							action={() => competitionEntry(id, 'leave')} />
					{/if}
					{#if canDraw}
						<ActionConfirmation inline name={drawing ? 'resume draw' : 'start draw'} message={drawMessage}
							action={() => competitionEntry(id, 'draw')} disabled={!drawing && entrants.length < 2} />
					{/if}
					{#if canEdit}<ActionLink href={`/comp/${id}/edit`} />{/if}
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
