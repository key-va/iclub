<script lang="ts">
	import { onMount } from 'svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import HelpText from '#lib/components/HelpText.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import { helpStrings, loadHelpStrings } from '#lib/stores/helpStrings.ts';

	const features = [
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
		<div class="group">
			{#each features as { title, topic } (topic)}
				{@const short = $helpStrings.strings[topic]}
				{@const long = $helpStrings.strings[`${topic}.long`]}
				{@const paragraphs = Array.isArray(long) ? long.filter((paragraph) => paragraph.trim()) : []}
				{#snippet belowRow()}
					{#if typeof short === 'string' && short.trim()}
						<p class="info feature-intro">{short}</p>
					{/if}
				{/snippet}
				{#if paragraphs.length}
					<HiddenOptions {title} {belowRow} helpIcon>
						<HelpText {topic} longOnly />
					</HiddenOptions>
				{:else}
					<HiddenOptions {title} {belowRow} />
				{/if}
			{/each}
		</div>
	{:else if $helpStrings.status === 'error'}
		<div class="group"><p class="info" role="status">Help is unavailable.</p></div>
	{:else}
		<div class="group"><p class="info" role="status">Loading help…</p></div>
	{/if}
</div>

<style>
	.page { width: 100%; }
	.feature-intro { padding: 0.5em 2em; }
</style>
