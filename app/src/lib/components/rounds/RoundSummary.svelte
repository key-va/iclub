<script lang="ts">
	import { availabilityOptions } from '#lib/components/rounds/roundRules.ts';
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		typeOf,
		nameOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import { setRoundRole } from '#lib/stores/remote.ts';

	let { round, team }: { round: GuidRow; team: GuidRow } = $props();
	const id = $derived(round.rk);
	const complete = $derived(round.state === 'complete');
	const players = $derived(
		relationsOf(round.rk).filter((row) => typeOf(row.rk) === 'user')
	);
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
	const mine = $derived(players.find((p) => p.rk === $local.caller_id));
	const myAvailabilityOptions = $derived(availabilityOptions(mine?.role));
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
	{#if !complete && myAvailabilityOptions.includes('available')}
		<ActionQuick name="available" action={() => setRoundRole(id, 'available')}>
			{#if myAvailabilityOptions.includes('unavailable')}
				<ActionQuick
					inline
					name="unavailable"
					action={() => setRoundRole(id, 'unavailable')}
				/>
			{/if}
		</ActionQuick>
	{:else if !complete && myAvailabilityOptions.includes('unavailable')}
		<ActionQuick
			name="unavailable"
			action={() => setRoundRole(id, 'unavailable')}
		/>
	{/if}
</div>
