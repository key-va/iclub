<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { onMount } from 'svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import RouteLink from '../routeLink.svelte';
	import RoundActions from './RoundActions.svelte';

	import { nameOf, type GuidRow } from '#lib/stores/guids.ts';

	let { round, team }: { round: GuidRow; team: GuidRow } = $props();
	const complete = $derived(round.state === 'complete');
	const fixtureName = $derived(
		round.opponent ? `${round.opponent} vs ${nameOf(team.rk)}` : nameOf(round.rk)
	);
	const address = $derived(typeof round.venue_address === 'string' ? round.venue_address.trim() : '');
	const coordinates = $derived(
		typeof round.venue_latitude === 'number' && typeof round.venue_longitude === 'number'
			? `${round.venue_latitude},${round.venue_longitude}`
			: ''
	);
	const venueDetails = $derived([
		typeof round.is_home === 'boolean' ? (round.is_home ? 'home' : 'away') : '',
		typeof round.court_type === 'string' ? round.court_type.trim() : '',
		typeof round.date === 'string' ? round.date : ''
	].filter(Boolean).join(' • '));
	let mapPlatform = $state<'apple' | 'android' | 'web'>('web');
	onMount(() => {
		if (/Android/i.test(navigator.userAgent)) mapPlatform = 'android';
		else if (/Macintosh|iPad|iPhone|iPod/i.test(navigator.userAgent)) mapPlatform = 'apple';
	});
	const mapUrl = $derived.by(() => {
		if (!coordinates && !address) return '';
		const query = encodeURIComponent(coordinates || `${address}, Victoria, Australia`);
		if (mapPlatform === 'android') return `geo:0,0?q=${query}`;
		if (mapPlatform === 'apple') return `https://maps.apple.com/?q=${query}`;
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

<SummaryHelp>
	{#snippet actions()}<RoundActions {round} {team} />{/snippet}
	{#snippet help()}<HelpText topic="feature.round" />{/snippet}
	{#if complete}
		<p class="info center"><strong>{fixtureName}</strong></p>
		<p class="info center">
			{#if round.result === 'bye' || round.result === 'washout'}
				{result.name}<br />
				<span class="description">{result.outcome}</span>
			{:else}
				{result.name} {result.outcome}{result.points ? ` ${result.points}` : ''}
				{#if result.scores}<br /><span class="description">{result.scores}</span>{/if}
			{/if}
		</p>
	{:else if mapUrl}
		<RouteLink href={mapUrl} title={fixtureName} description={venueDetails}>
			{#snippet icon()}
				<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
				<circle cx="12" cy="10" r="2.5" />
			{/snippet}
		</RouteLink>
	{:else}
		<HiddenOptions title={fixtureName} description={venueDetails} />
	{/if}
</SummaryHelp>
