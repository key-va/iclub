<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { entityOf, guids, hrefOf, imageOf, nameOf, relationsOf, typeOf, type GuidRow } from '#lib/stores/guids.ts';
	import { competitionEntry } from '#lib/stores/remote.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
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
		<EntityHeader entity={elim} subtitle={elim.state === 'pending' ? 'awaiting club approval' : open ? 'entries open' : drawing ? 'draw in progress' : elim.state === 'complete' ? 'complete' : 'draw underway'} />
		{#if elim.state === 'pending' && canApprove}
			<ActionConfirmation name="approve" message={`Approve ${elim.name}?`} action={() => competitionEntry(id, 'activate')} />
		{:else if open && caller}
			{#if mine?.is_participant === true || mine?.state === 'pending'}
				<ActionConfirmation name={mine.state === 'pending' ? 'cancel request' : 'withdraw'} message="Withdraw your entry?" action={() => competitionEntry(id, 'leave')} />
			{:else}
				<ActionConfirmation name="request to join" message={`Request to join ${elim.name}?`} action={() => competitionEntry(id, 'join')} />
			{/if}
		{/if}

		{#if drawReady}
			{#if typeof elim.champion_id === 'string' && elim.champion_id}
				<RouteLink href={hrefOf(elim.champion_id)} title={nameOf(elim.champion_id)} description="champion" image={imageOf(elim.champion_id)} />
			{/if}
			{#each rounds as round (round.rk)}
				<section class="group">
					<h2>{round.name}</h2>
					{#each matchesOf(round.rk) as match (match.rk)}
						<RouteLink href={hrefOf(match.rk)} title={match.name}
							description={match.state === 'bye' ? 'bye' : matchSummary(match.rk) || (match.state === 'waiting' ? 'awaiting players' : 'ready to play')}
						/>
					{/each}
				</section>
			{/each}
		{/if}

		{#if entrants.length || (open && admin && requests.length)}
			<section class="group">
				<h2>Participants</h2>
				{#if open && admin}<p class="seed-count">{seeds.length} of 8 seeds assigned</p>{/if}
				{#each entrants as row (row.rk)}
					{@const seeded = Number(row.seed) > 0}
					{@const status = seeded ? `seeded ${row.seed}` : 'unseeded'}
					{@const tone = seeded ? 'green' : 'blue'}
					<div class="row participant">
						<div class="player">
							{#snippet detail()}<span class="seed-status {tone}">{status}</span>{/snippet}
							<RouteLink href={hrefOf(row.rk)} title={nameOf(row.rk)} image={imageOf(row.rk)} {detail} />
						</div>
						{#if open && admin && (seeded || seeds.length < 8)}
							<ActionQuick inline name={seeded ? 'unseed' : 'seed'} {tone}
								label={seeded ? `Remove seed ${row.seed} from ${nameOf(row.rk)}` : `Seed ${nameOf(row.rk)}`}
								action={() => competitionEntry(id, seeded ? 'unseed' : 'seed', row.rk)} />
						{/if}
					</div>
				{/each}
				{#if open && admin}
					{#each requests as row (row.rk)}
						<div class="row participant">
							<div class="player">
								<RouteLink href={hrefOf(row.rk)} title={nameOf(row.rk)} image={imageOf(row.rk)} description="pending" />
							</div>
							<ActionQuick inline name="accept" tone="orange" label={`Accept ${nameOf(row.rk)}`}
								action={() => competitionEntry(id, 'accept', row.rk)} />
						</div>
					{/each}
				{/if}
			</section>
		{/if}

		{#if admin && (drawing || open)}
			<ActionConfirmation name={drawing ? 'resume draw' : 'start draw'} message={drawMessage}
				action={() => competitionEntry(id, 'draw')} disabled={!drawing && entrants.length < 2} />
		{/if}
	{:else if elim}
		<EntityHeader entity={elim} subtitle="competition" />
		<p>This competition type is unavailable.</p>
	{:else}
		<p>{$guids.loaded ? 'Not found' : 'Loading'}</p>
	{/if}
</div>

<style>
	h2 { font-size: 1rem; margin: 0; padding: 0.85rem 1rem 0.35rem; }
	.seed-count { margin: 0.25rem 1rem; }
	.participant { justify-content: space-between; }
	.player { flex: 1; min-width: 0; }
	.seed-status { background: none; }
	.seed-status.green { color: #187543; }
	.seed-status.blue { color: #165992; }
</style>
