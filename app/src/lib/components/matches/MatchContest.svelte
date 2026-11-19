<script lang="ts">
	import MatchActions from './MatchActions.svelte';
	import MessageThread from '#lib/components/messages/MessageThread.svelte';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';

	import { completeMatch } from '#lib/stores/remote.ts';

	import { local } from '#lib/stores/local.ts';
	import { ladderSettings } from '#lib/components/ladders/ladderSettings.ts';
	import {
		entityOf,
		relationsOf,
		hrefOf,
		imageOf,
		nameOf,
		typeOf,
		type GuidRow
	} from '#lib/stores/guids.ts';

	import VersusLink from '#lib/components/versusLink.svelte';

	import RouteLink from '#lib/components/routeLink.svelte';

	let { match, ladder }: { match: GuidRow; ladder?: GuidRow } = $props();
	const caller_id = $derived($local.caller_id);
	const matchId = $derived(match.rk);
	const players = $derived(
		relationsOf(matchId).filter(
			(row) =>
				typeOf(row.rk) === (ladder?.format === 'doubles' ? 'pair' : 'user')
		)
	);
	const matchUsers = $derived(
		relationsOf(matchId).filter(
			(row) => typeOf(row.rk) === 'user' && entityOf(row.rk)
		)
	);
	const challenger = $derived(
		players.find((player) => player.role === 'challenger')
	);
	const defender = $derived(
		players.find((player) => player.role === 'defender')
	);

	const isLadderAdmin = $derived(
		!!ladder &&
			relationsOf(ladder.rk).some(
				(relation) => relation.rk === caller_id && relation.is_admin === true
			)
	);
	const isPlayer = $derived(
		matchUsers.some(
			(user) =>
				user.rk === caller_id &&
				['challenger', 'defender', 'participant'].includes(String(user.role))
		)
	);
	// One row of inputs per set, labelled by match format
	const setLabels: Record<string, string[]> = {
		super_set: ['super set'],
		best_of_three: ['set 1', 'set 2', 'tie break'],
		fast_four: ['set 1', 'set 2', 'set 3']
	};
	const labels = $derived(
		setLabels[String(ladder?.match_format ?? 'super_set')] ??
			setLabels.super_set
	);
	const maxGamesByFormat: Record<string, number> = {
		super_set: 8,
		best_of_three: 7,
		fast_four: 4
	};
	const maxGames = $derived(
		maxGamesByFormat[String(ladder?.match_format ?? 'super_set')] ?? 8
	);
	const formatRules = $derived.by(() => {
		const format = String(
			ladder?.match_format ?? ladderSettings.match_format.default
		);
		const setting = ladderSettings.match_format;
		const rules =
			setting.type === 'enum' ? setting.values[format]?.description : '';
		return rules ? `Match format: ${rules}.` : '';
	});
	const isComplete = $derived(match?.state === 'complete');
	// Recorded scores are a single number or comma-separated games per set, eg "6,4"
	const recordedGames = (player?: Record<string, unknown>) =>
		player?.score === undefined || player.score === ''
			? []
			: String(player.score).split(',');
	const recordedChallenger = $derived(recordedGames(challenger));
	const recordedDefender = $derived(recordedGames(defender));
	const roleText = (player: Record<string, unknown>, fallback: string) =>
		isComplete ? String(player.result ?? fallback) : fallback;
	const completeSummary = $derived.by(() => {
		const winner = [challenger, defender].find(
			(player) => player?.result === 'winner'
		);
		const loser = winner === challenger ? defender : challenger;
		if (!winner) return '';
		const mine = winner === challenger ? recordedChallenger : recordedDefender;
		const theirs =
			winner === challenger ? recordedDefender : recordedChallenger;
		const sets = mine.map((games, i) => `${games}-${theirs[i] ?? 0}`).join(' ');
		return loser?.result === 'forfeiter'
			? `${nameOf(winner.rk)} wins by forfeit${sets ? ` ${sets}` : ''}`
			: `${nameOf(winner.rk)} wins${sets ? ` ${sets}` : ''}`;
	});
	let challengerScores = $state<string[]>(['', '', '']);
	let defenderScores = $state<string[]>(['', '', '']);
	let showHelp = $state(false);

	// A set counts once either side has a score; unplayed trailing sets stay empty
	const isGames = (text: string) =>
		/^\d+$/.test(text.trim()) && Number(text) <= maxGames;
	const playedRows = $derived(
		labels
			.map((_, i) => i)
			.filter(
				(i) =>
					challengerScores[i].trim() !== '' || defenderScores[i].trim() !== ''
			)
	);
	const challengerSets = $derived(
		playedRows.map((i) => Number(challengerScores[i]))
	);
	const defenderSets = $derived(
		playedRows.map((i) => Number(defenderScores[i]))
	);
	const hasInvalidScores = $derived(
		labels.some((_, i) =>
			[challengerScores[i], defenderScores[i]].some(
				(score) => score.trim() !== '' && !isGames(score)
			)
		)
	);
	const scoreValid = $derived(
		playedRows.length > 0 &&
			playedRows.every(
				(row, index) =>
					row === index &&
					isGames(challengerScores[row]) &&
					isGames(defenderScores[row])
			)
	);
	// "<winner> wins 6-2 6-3", with each set shown from the winner's side; the winner is whoever takes more sets
	const scoreSummary = $derived.by(() => {
		const won = (mine: number[], theirs: number[]) =>
			mine.filter((games, i) => games > theirs[i]).length;
		const challengerWon = won(challengerSets, defenderSets);
		const defenderWon = won(defenderSets, challengerSets);
		if (challengerWon === defenderWon)
			return `${nameOf(challenger?.rk ?? '')} ${challengerSets.join(' ')} - ${defenderSets.join(' ')} ${nameOf(defender?.rk ?? '')}`;
		const [winner, mine, theirs] =
			challengerWon > defenderWon
				? [challenger, challengerSets, defenderSets]
				: [defender, defenderSets, challengerSets];
		return `${nameOf(winner?.rk ?? '')} wins ${mine.map((games, i) => `${games}-${theirs[i]}`).join('  ')}`;
	});
</script>

{#if challenger && defender}
	<div class="group">
		<VersusLink
			left={{
				href: hrefOf(challenger.rk),
				title: nameOf(challenger.rk),
				description: roleText(challenger, 'challenger'),
				image: imageOf(ladder?.format === 'doubles' ? ladder.rk : challenger.rk)
			}}
			right={{
				href: hrefOf(defender.rk),
				title: nameOf(defender.rk),
				description: roleText(defender, 'defender'),
				image: imageOf(ladder?.format === 'doubles' ? ladder.rk : defender.rk)
			}}
		/>
		{#if isComplete && completeSummary}
			<div class="row center">
				<p class="info">{completeSummary}</p>
			</div>
		{/if}
		{#if match.state === 'pending'}
			<div class="row center">
				<p class="info">
					waiting for <strong>{nameOf(defender.rk)}</strong> to accept
				</p>
			</div>
		{/if}
	</div>
	<MatchActions
		{match}
		forfeitData={scoreValid
			? { challenger_score: challengerSets, defender_score: defenderSets }
			: {}}
	/>

	{#if match.state === 'active'}
		<div class="group">
			{#each labels as label, i (label)}
				<div class="row scores">
					<input
						type="text"
						inputmode="numeric"
						maxlength="1"
						pattern={`[0-${maxGames}]`}
						title={`from 0 to ${maxGames}`}
						placeholder="0"
						aria-label="{nameOf(challenger.rk)} {label}"
						aria-invalid={challengerScores[i].trim() !== '' &&
							!isGames(challengerScores[i])}
						bind:value={challengerScores[i]}
					/>
					<span class="set-label">{label}</span>
					<input
						type="text"
						inputmode="numeric"
						maxlength="1"
						pattern={`[0-${maxGames}]`}
						title={`from 0 to ${maxGames}`}
						placeholder="0"
						aria-label="{nameOf(defender.rk)} {label}"
						aria-invalid={defenderScores[i].trim() !== '' &&
							!isGames(defenderScores[i])}
						bind:value={defenderScores[i]}
					/>
				</div>
			{/each}
			{#if hasInvalidScores}
				<div class="row left help">
					<p class="error">Scores must be a number from 0 to {maxGames}.</p>
				</div>
			{/if}
			{#if showHelp}
				<div class="row left help">
					<p>
						Match score: enter the games won by each player in each set played,
						with a tiebreak counting as a single game. Leave unplayed sets
						empty.
					</p>
				</div>
				<div class="row left help">
					<p>{formatRules}</p>
				</div>
			{/if}
		</div>
	{/if}
{/if}

{#if match.state === 'active'}
	<ActionConfirmation
		name="submit"
		message={`${scoreSummary}?`}
		action={() =>
			completeMatch(matchId, {
				challenger_score: challengerSets,
				defender_score: defenderSets
			})}
		disabled={!scoreValid || !(isPlayer || isLadderAdmin)}
	>
		<button
			class="blue"
			aria-label="help"
			aria-pressed={showHelp}
			onclick={() => (showHelp = !showHelp)}
		>
			<svg
				viewBox="0 0 24 24"
				width="1rem"
				height="1rem"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
				role="img"
				aria-label="Help"
			>
				<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
				<path d="M12 18h.01" />
			</svg>
		</button>
	</ActionConfirmation>
{/if}

<MessageThread parentId={matchId} showTime />

<RouteLink
	href={hrefOf(ladder?.rk ?? '')}
	title={ladder?.name ?? 'someone'}
	description="ladder"
	image={imageOf(ladder?.rk ?? '')}
></RouteLink>

<style>
	.scores {
		gap: 0.5rem;
		padding: 0 0.5rem 0.5rem;
		align-items: center;
		justify-content: space-between;
	}
	.set-label {
		flex: 1 1 auto;
		text-align: center;
		font-size: 0.85em;
	}
	.scores input {
		flex: 0 0 6em;
		width: 6em;
		min-width: 0;
		text-align: center;
	}
	.help p {
		padding: 1em 2em;
	}
</style>
