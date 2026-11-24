<script lang="ts">
	import { onMount } from 'svelte';
	import RoundActions from './RoundActions.svelte';

	import { nameOf, type GuidRow } from '#lib/stores/guids.ts';

	let { round, team }: { round: GuidRow; team: GuidRow } = $props();
	const complete = $derived(round.state === 'complete');
	const fixtureName = $derived(
		`${round?.opponent} vs ${nameOf(team?.rk ?? '')}`
	);
	const venue = $derived(typeof round.venue === 'string' ? round.venue.trim() : '');
	const coordinates = $derived(
		typeof round.venue_latitude === 'number' && typeof round.venue_longitude === 'number'
			? `${round.venue_latitude},${round.venue_longitude}`
			: ''
	);
	const venueDetails = $derived([
		typeof round.is_home === 'boolean' ? (round.is_home ? 'home' : 'away') : '',
		typeof round.court_type === 'string' ? round.court_type : ''
	].filter(Boolean).join(' • '));
	let mapPlatform = $state<'apple' | 'android' | 'web'>('web');
	onMount(() => {
		if (/Android/i.test(navigator.userAgent)) mapPlatform = 'android';
		else if (/Macintosh|iPad|iPhone|iPod/i.test(navigator.userAgent)) mapPlatform = 'apple';
	});
	const mapUrl = $derived.by(() => {
		const query = encodeURIComponent(coordinates || `${venue} tennis, Victoria, Australia`);
		if (mapPlatform === 'android') return `geo:0,0?q=${query}`;
		if (mapPlatform === 'apple') {
			return coordinates
				? `https://maps.apple.com/?ll=${query}&q=${encodeURIComponent(venue)}`
				: `https://maps.apple.com/?q=${query}`;
		}
		return `https://www.google.com/maps/search/?api=1&query=${query}`;
	});
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
		<p class="info center description">{round.date}</p>
		{#if venue || venueDetails}
			<p class="info center">
				{#if venue}
					<a class="venue-link" href={mapUrl} aria-label={`Open ${venue} in Maps`}>
						<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none"
							stroke="currentColor" stroke-width="2" aria-hidden="true">
							<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
							<circle cx="12" cy="10" r="2.5" />
						</svg>
						{venue}
					</a>
				{/if}
				{#if venueDetails}
					{#if venue}<br />{/if}<span class="description">{venueDetails}</span>
				{/if}
			</p>
		{/if}
	{/if}
</div>
<RoundActions {round} {team} />

<style>
	.venue-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0;
		color: inherit;
	}
	.venue-link svg {
		flex-shrink: 0;
	}
</style>
