<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { entityOf, guids, hrefOf, imageOf, nameOf, relationsOf, typeOf, type GuidRow } from '#lib/stores/guids.ts';
	import { competitionEntry } from '#lib/stores/remote.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import EntityActions from '#lib/components/EntityActions.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import { competitionPlayerMatches, competitionPlayerStatus } from '#lib/components/competitions/competitionPlayers.ts';
	import { matchSummary } from '#lib/components/matches/matchRules.ts';

	const id = $derived(page.params.comp_id ?? '');
	const elim = $derived(entityOf(id));
	const links = $derived(relationsOf(id));
	const caller = $derived($local.caller_id);
	const mine = $derived(links.find((row) => row.rk === caller));
	const admin = $derived(mine?.is_admin === true);
	const canApprove = $derived(links.some((row) =>
		typeOf(row.rk) === 'club' && relationsOf(row.rk).some((link) => link.rk === caller && link.is_admin === true)
	));
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
		links.filter((row) => typeOf(row.rk) === 'user' && row.is_participant === true)
			.sort((a, b) => nameOf(a.rk).localeCompare(nameOf(b.rk)))
	);
	const seeds = $derived(entrants.filter((row) => Number(row.seed) > 0)
		.sort((a, b) => Number(a.seed) - Number(b.seed)));
	const requests = $derived(links.filter((row) => typeOf(row.rk) === 'user' && row.state === 'pending'));
	const rounds = $derived(links.filter((row) => typeOf(row.rk) === 'round')
		.map((row) => entityOf(row.rk)).filter((row): row is GuidRow => !!row)
		.sort((a, b) => Number(a.bracket_round) - Number(b.bracket_round)));
	const matchesOf = (round: string) => relationsOf(round)
		.filter((row) => typeOf(row.rk) === 'match')
		.map((row) => entityOf(row.rk)).filter((row): row is GuidRow => !!row)
		.sort((a, b) => Number(a.bracket_match) - Number(b.bracket_match));
	const byes = $derived(2 ** Math.ceil(Math.log2(Math.max(entrants.length, 2))) - entrants.length);
	const drawMessage = $derived(drawing
		? 'Resume the draw?'
		: `Start the draw with ${entrants.length} entrants and ${byes} byes? ${requests.length ? `${requests.length} pending requests will close. ` : ''}${seeds.length ? `Seeds: ${seeds.map((row) => `#${row.seed} ${nameOf(row.rk)}`).join(', ')}.` : 'No seeds assigned.'}`);
</script>

<div class="page">
	{#if elim?.competition_type === 'elimination'}
		<EntityHeader entity={elim} />
		<EntityActions section="primary" summary={`elimination • singles • super set • ${status}`}>
			{#if elim.state === 'pending' && canApprove}
				<ActionConfirmation inline arrow showLabel name="approve" message={`Approve ${elim.name}?`}
					action={() => competitionEntry(id, 'activate')} />
			{:else if canJoin}
				<ActionConfirmation inline arrow showLabel name="request to join" message={`Request to join ${elim.name}?`}
					action={() => competitionEntry(id, 'join')} />
			{/if}
		</EntityActions>

		{#if open && admin && requests.length}
			<div class="group">
				{#each requests as row (row.rk)}
					<RouteLinkHiddenAction href={hrefOf(row.rk)} title={nameOf(row.rk)}
						image={imageOf(row.rk)} description="waiting to join" colour="orange">
						<ActionQuick inline name="accept" label={`Accept ${nameOf(row.rk)}`}
							action={() => competitionEntry(id, 'accept', row.rk)} />
					</RouteLinkHiddenAction>
				{/each}
			</div>
		{:else if open && mine?.state === 'pending'}
			<div class="group">
				<RouteLink href={hrefOf(mine.rk)} title={nameOf(mine.rk)}
					image={imageOf(mine.rk)} description="join request pending" />
			</div>
		{/if}

		<div class="group">
			<HiddenOptions title="Players" badge={entrants.length} />
			{#each entrants as row (row.rk)}
				{@const ranked = Number(row.seed) > 0}
				{@const canRank = open && admin && (ranked || seeds.length < 8)}
				{@const description = competitionPlayerStatus(row, competitionPlayerMatches(id, row.rk))}
				<RouteLinkHiddenAction href={hrefOf(row.rk)} title={nameOf(row.rk)}
					image={imageOf(row.rk)} {description}
					colour={description === 'eliminated' ? 'red' : ranked ? 'green' : 'blue'}>
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
			{#if typeof elim.champion_id === 'string' && elim.champion_id}
				<RouteLink href={hrefOf(elim.champion_id)} title={nameOf(elim.champion_id)} description="champion" image={imageOf(elim.champion_id)} />
			{/if}
			{#each rounds as round (round.rk)}
				<HiddenOptions title={round.name}>
					{#each matchesOf(round.rk) as match (match.rk)}
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
							message={mine?.state === 'pending' ? 'Cancel your join request?' : 'Withdraw your entry?'}
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
