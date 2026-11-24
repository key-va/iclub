<script lang="ts">
	import RoundActions from './RoundActions.svelte';

	import { nameOf, type GuidRow } from '#lib/stores/guids.ts';

	let { round, team }: { round: GuidRow; team: GuidRow } = $props();
	const id = $derived(round.rk);
	const complete = $derived(round.state === 'complete');
	const fixtureName = $derived(
		`${round?.opponent} vs ${nameOf(team?.rk ?? '')}`
	);
	const result = $derived.by(() => {
		if (!round || !team) return { name: '', outcome: '', points: '', scores: '' };
		if (round.result === 'bye' || round.result === 'washout')
			return { name: nameOf(team.rk), outcome: round.result, points: '', scores: '' };
		const opponentWon = round.result === 'loser';
		const score = (key: 'points' | 'sets' | 'games', label: string) => {
			const first = round[`${key}_${opponentWon ? 'against' : 'for'}`];
			const second = round[`${key}_${opponentWon ? 'for' : 'against'}`];
			return typeof first === 'number' && typeof second === 'number'
				? `${first}-${second} ${label}`
				: '';
		};
		return {
			name: opponentWon ? String(round.opponent) : nameOf(team.rk),
			outcome:
				round.result === 'draw'
					? 'draws'
					: ['winner', 'loser'].includes(String(round.result))
						? 'wins'
						: 'result',
			points: score('points', 'Points'),
			scores: [score('sets', 'sets'), score('games', 'games')].filter(Boolean).join(' • ')
		};
	});
</script>

<div class="group">
	<p class="info center"><strong>{fixtureName}</strong></p>
	{#if complete}
		<p class="info center">
			{#if round.result === 'bye' || round.result === 'washout'}
				{result.name}<br />
				<span class="description">{result.outcome}</span>
			{:else}
				{result.name} {result.outcome}{result.points ? ` ${result.points}` : ''}
				{#if result.scores}<br /><span class="description">{result.scores}</span>{/if}
			{/if}
		</p>
	{:else}
		<p class="info center description">
			{round.date}{round.venue ? ` • ${round.venue}` : ''}
		</p>
	{/if}
</div>
<RoundActions {round} {team} />
