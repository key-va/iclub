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
		if (!round || !team) return { name: '', outcome: '', scores: '' };
		if (round.result === 'bye' || round.result === 'washout')
			return { name: nameOf(team.rk), outcome: round.result, scores: '' };
		const opponentWon = round.result === 'loser';
		return {
			name: opponentWon ? String(round.opponent) : nameOf(team.rk),
			outcome:
				round.result === 'draw'
					? 'draws'
					: ['winner', 'loser'].includes(String(round.result))
						? 'wins'
						: 'result',
			scores: ['points', 'sets', 'games']
				.filter(
					(key) =>
						typeof round[`${key}_for`] === 'number' &&
						typeof round[`${key}_against`] === 'number'
				)
				.map(
					(key) =>
						`${round[`${key}_${opponentWon ? 'against' : 'for'}`]}-${round[`${key}_${opponentWon ? 'for' : 'against'}`]} ${key}`
				)
				.join(' • ')
		};
	});
</script>

<div class="group">
	<p class="info center"><strong>{fixtureName}</strong></p>
	{#if complete}
		<p class="info center">
			{result.name}<br />
			{result.outcome}
			{result.scores}
		</p>
	{:else}
		<p class="info center">
			{round.date}{round.venue ? ` • ${round.venue}` : ''}
		</p>
	{/if}
</div>
<RoundActions {round} {team} />
