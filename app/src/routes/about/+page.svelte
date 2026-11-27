<script lang="ts">
	import { onMount } from 'svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import HelpText from '#lib/components/HelpText.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import { helpStrings, loadHelpStrings } from '#lib/stores/helpStrings.ts';

	const features = [
		{ title: 'Home', topic: 'feature.home' },
		{ title: 'Users', topic: 'feature.user' },
		{ title: 'Ladders', topic: 'feature.ladder' },
		{ title: 'Comps', topic: 'feature.comp' },
		{ title: 'Teams', topic: 'feature.team' },
		{ title: 'Groups', topic: 'feature.group' },
		{ title: 'Rounds', topic: 'feature.round' },
		{ title: 'Matches', topic: 'feature.match' }
	];

	onMount(() => { void loadHelpStrings(); });
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="about" image={$branding.icon} />

	<div class="group">
		<p class="info center">
			<strong>{$branding.name}</strong><br />
			Intra Club helps you manage and participate in ladders, competitions, teams and groups
		</p>
	</div>

	{#if $helpStrings.status === 'ready'}
		{#each features as { title, topic } (topic)}
			{@const description = $helpStrings.strings[topic]}
			<HiddenOptions {title} description={typeof description === 'string' ? description : undefined} isWhite>
				<HelpText {topic} />
			</HiddenOptions>
		{/each}
	{:else if $helpStrings.status === 'error'}
		<div class="group"><p class="info" role="status">Help is unavailable.</p></div>
	{:else}
		<div class="group"><p class="info" role="status">Loading help…</p></div>
	{/if}
</div>

<style>
	.page { width: 100%; }
</style>
