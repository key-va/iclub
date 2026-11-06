<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { ladderSettings } from '#lib/strings.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf, nameOf } from '#lib/stores/guids.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import VersusLink from '#lib/components/versusLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
    import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id } = $local;

	const matchId = $derived(page.params.match_id ?? '');
	const match = $derived(entityOf($guids.items, matchId));
	const ladder = $derived(relatedEntities($guids.items, matchId, 'ladder')[0]);
	const players = $derived(relatedEntities($guids.items, matchId, ladder?.format === 'doubles' ? 'pair' : 'user'));
	const matchUsers = $derived(relatedEntities($guids.items, matchId, 'user'));
	const challenger = $derived(players.find((player) => player.relation.role === 'challenger'));
	const defender = $derived(players.find((player) => player.relation.role === 'defender'));

	const isLadderAdmin = $derived(
		!!ladder && relationsOf($guids.items, ladder.rk).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const isPlayer = $derived(matchUsers.some(user => user.rk === caller_id && ['challenger', 'defender', 'participant'].includes(String(user.relation.role))));
	const isDefender = $derived(caller_id === defender?.rk || !!defender && relatedEntities($guids.items, defender.rk, 'user').some(user => user.rk === caller_id));

	// One row of inputs per set, labelled by match format
	const setLabels: Record<string, string[]> = {
		super_set: ['super set'],
		best_of_three: ['set 1', 'set 2', 'tie break'],
		fast_four: ['set 1', 'set 2', 'set 3']
	};
	const labels = $derived(setLabels[String(ladder?.match_format ?? 'super_set')] ?? setLabels.super_set);
	const formatRules = $derived.by(() => {
		const format = String(ladder?.match_format ?? ladderSettings.match_format.default);
		const setting = ladderSettings.match_format;
		const rules = setting.type === 'enum' ? setting.values[format] : '';
		return rules ? `Match format: ${rules}.` : '';
	});
	const isComplete = $derived(match?.state === 'complete');
	// Recorded scores are a single number or comma-separated games per set, eg "6,4"
	const recordedGames = (player?: { relation: Record<string, unknown> }) =>
		player?.relation.score === undefined || player.relation.score === '' ? [] : String(player.relation.score).split(',');
	const recordedChallenger = $derived(recordedGames(challenger));
	const recordedDefender = $derived(recordedGames(defender));
	const roleText = (player: { relation: Record<string, unknown> }, fallback: string) =>
		isComplete ? String(player.relation.result ?? fallback) : fallback;
	const completeSummary = $derived.by(() => {
		const winner = [challenger, defender].find((player) => player?.relation.result === 'winner');
		const loser = winner === challenger ? defender : challenger;
		if (!winner) return '';
		const mine = winner === challenger ? recordedChallenger : recordedDefender;
		const theirs = winner === challenger ? recordedDefender : recordedChallenger;
		const sets = mine.map((games, i) => `${games}-${theirs[i] ?? 0}`).join(' ');
		return loser?.relation.result === 'forfeiter'
			? `${winner.name} wins by forfeit${sets ? ` ${sets}` : ''}`
			: `${winner.name} wins${sets ? ` ${sets}` : ''}`;
	});
	let challengerScores = $state<string[]>(['', '', '']);
	let defenderScores = $state<string[]>(['', '', '']);
	let showHelp = $state(false);

	// A set counts once either side has a score; unplayed trailing sets stay empty
	const isGames = (text: string) => /^\d{1,2}$/.test(text.trim());
	const playedRows = $derived(
		labels.map((_, i) => i).filter((i) => challengerScores[i].trim() !== '' || defenderScores[i].trim() !== '')
	);
	const challengerSets = $derived(playedRows.map((i) => Number(challengerScores[i])));
	const defenderSets = $derived(playedRows.map((i) => Number(defenderScores[i])));
	const scoreValid = $derived(
		playedRows.length > 0 &&
			playedRows.every((row, index) => row === index && isGames(challengerScores[row]) && isGames(defenderScores[row]))
	);
	// "<winner> wins 6-2 6-3", with each set shown from the winner's side; the winner is whoever takes more sets
	const scoreSummary = $derived.by(() => {
		const won = (mine: number[], theirs: number[]) => mine.filter((games, i) => games > theirs[i]).length;
		const challengerWon = won(challengerSets, defenderSets);
		const defenderWon = won(defenderSets, challengerSets);
		if (challengerWon === defenderWon) return `${challenger?.name} ${challengerSets.join(' ')} - ${defenderSets.join(' ')} ${defender?.name}`;
		const [winner, mine, theirs] =
			challengerWon > defenderWon ? [challenger, challengerSets, defenderSets] : [defender, defenderSets, challengerSets];
		return `${winner?.name} wins ${mine.map((games, i) => `${games}-${theirs[i]}`).join('  ')}`;
	});
	const canAccept = $derived(match?.state === 'pending' && (isDefender || isLadderAdmin));

	// Message ids start with a timestamp, so sorting them gives oldest first
	const messages = $derived(
		relatedEntities($guids.items, matchId, 'message')
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({
				...message,
				// the sender is a user, or the bot for automated messages
				sender: relatedEntities($guids.items, message.rk).find((related) => related.relation.role === 'sender')
			}))
	);
	let messageText = $state('');

	// Ids are type_YYYY-MM-DD_HH-MM-SS_hex with the time in UTC; show it in the viewer's own timezone
	function sentAt(id: string) {
		const parts = id.match(/_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_/);
		if (!parts) return '';
		const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
		const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
		return date.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: '2-digit' });
	}
	const messageValid = $derived(messageText.trim() !== '' && !/[\p{C}]/u.test(messageText));
</script>

<div class="page">
	{#if match}
		<div class="row right">
			<p class="truncate"><strong>{match.name}</strong><br />{match.state}</p>
			<div class="blank-icon-small"></div>
		</div>

		{#if ladder}
			<div class="row center">
				<div class="round-icon-big" style="background-image: url('{imageOf(ladder.rk)}');"></div>
			</div>
		{/if}

		{#if challenger && defender}
			<div class="group">
				<VersusLink
					left={{ href: hrefOf(challenger.rk), title: challenger.name ?? 'no name', description: roleText(challenger, 'challenger'), image: imageOf(ladder?.format === 'doubles' ? ladder.rk : challenger.rk) }}
					right={{ href: hrefOf(defender.rk), title: defender.name ?? 'no name', description: roleText(defender, 'defender'), image: imageOf(ladder?.format === 'doubles' ? ladder.rk : defender.rk) }}
				/>
				{#if isComplete && completeSummary}
					<div class="row center">
						<p class="info">{completeSummary}</p>
					</div>
				{/if}
				{#if match.state === 'active'}
					{#each labels as label, i (label)}
						<div class="row scores">
							<input type="text" inputmode="numeric" maxlength="2" placeholder="0" aria-label="{challenger.name} {label}" bind:value={challengerScores[i]} />
							<span class="set-label">{label}</span>
							<input type="text" inputmode="numeric" maxlength="2" placeholder="0" aria-label="{defender.name} {label}" bind:value={defenderScores[i]} />
						</div>
					{/each}
					{#if showHelp}
						<div class="row left help">
							<p>Match score: enter the games won by each player in each set played, with a tiebreak counting as a single game. Leave unplayed sets empty.</p>
						</div>
						<div class="row left help">
							<p>{formatRules}</p>
						</div>
					{/if}
				{/if}
				{#if match.state === 'pending'}
					<div class="center">
						<p>waiting for {defender.name} to accept</p>
					</div>
				{/if}
			</div>
		{/if}

		{#if match.state === 'pending' && canAccept}
			<ApiService
				name="accept"
				message={`accept the challenge from ${challenger?.name ?? 'your opponent'}?`}
				endpoint={`match/${matchId}/accept`}
				disabled={!canAccept}
			/>
		{/if}

		{#if match.state === 'active'}
			<ApiService
				name="submit"
				message={`${scoreSummary}?`}
				endpoint={`match/${matchId}/complete`}
				data={{ challenger_score: challengerSets, defender_score: defenderSets }}
				disabled={!scoreValid || !(isPlayer || isLadderAdmin)}
			>
				<button class="blue" aria-label="help" aria-pressed={showHelp} onclick={() => (showHelp = !showHelp)}>
					<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Help">
						<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
						<path d="M12 18h.01" />
					</svg>
				</button>
			</ApiService>
		{/if}
		
		<div class="group">
			<HiddenOptions title="Messages" description="" badge={messages.length} />
			{#if messages.length}
				{#each messages as message (message.rk)}
					<RouteLink href={hrefOf(message.sender?.rk ?? '')} title={message.sender?.name ?? 'someone'} description={sentAt(message.rk)} image={imageOf(message.sender?.rk ?? '')}>
					</RouteLink>
					<div class="message right"><p>{message.name}</p></div>
				{/each}
			{/if}

			
			<ApiService
				name="send"
				arrow
				endpoint="message/create"
				data={{ match_id: matchId, text: messageText.trim() }}
				confirm={false}
				disabled={!messageValid}
				onsuccess={() => {
					messageText = '';
				}}
			>
				<input type="text" placeholder="message" maxlength="500" autocomplete="off" aria-label="message" bind:value={messageText} />
			</ApiService>
			
		</div>

		<RouteLink href={hrefOf(ladder?.rk)} title={ladder?.name ?? 'someone'} description="ladder" image={imageOf(ladder?.rk)}>
		</RouteLink>

		<HiddenOptions inline title="More Options" description="match is {String(match.state)}">
			<ApiService
				inline
				name="forfeit"
				message="forfeit this match? your opponent will be awarded the win"
				endpoint={`match/${matchId}/forfeit`}
				data={{
					...(scoreValid ? { challenger_score: challengerSets, defender_score: defenderSets } : {})
				}}
				disabled={!isPlayer || (match.state !== 'pending' && match.state !== 'active')}
			/>
		</HiddenOptions>
	
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />match</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
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
	.message p {
		padding: 0 2em 1em 2em;
		overflow-wrap: anywhere;
	}
	.help p {
		padding: 1em 2em;
	}
</style>
