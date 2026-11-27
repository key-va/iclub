<script lang="ts">
	import { onMount } from 'svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import HelpText from '#lib/components/HelpText.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import { helpStrings, loadHelpStrings } from '#lib/stores/helpStrings.ts';

	const sections = [
		{ name: 'Features', prefix: 'feature.' },
		{ name: 'Settings', prefix: 'settings.' }
	];
	const names: Record<string, string> = {
		comp: 'Competition',
		comp_system: 'Competition system',
		genc: 'Related items',
		user: 'User page'
	};
	const topics = $derived($helpStrings.status === 'ready'
		? [...new Set(Object.keys($helpStrings.strings).map((key) => key.replace(/\.long$/, '')))]
		: []);

	function topicLabel(topic: string) {
		return topic.split('.').slice(1).map((part) =>
			names[part] ?? part.replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase())
		).join(' — ');
	}

	onMount(() => { void loadHelpStrings(); });
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="about" image={$branding.icon} />

	{#if $helpStrings.status === 'ready'}
		{#each sections as section (section.prefix)}
			{@const entries = topics.filter((topic) => topic.startsWith(section.prefix))}
			{#if entries.length}
				<section class="group">
					<h2>{section.name}</h2>
					{#each entries as topic (topic)}
						<article>
							<h3>{topicLabel(topic)}</h3>
							<HelpText {topic} />
						</article>
					{/each}
				</section>
			{/if}
		{/each}
	{:else if $helpStrings.status === 'error'}
		<div class="group"><p class="info" role="status">Help is unavailable.</p></div>
	{:else}
		<div class="group"><p class="info" role="status">Loading help…</p></div>
	{/if}
</div>

<style>
	.page { width: 100%; }

	h2, h3 {
		margin: 0;
		padding: 1rem 1rem 0;
	}

	h2 { font-size: 1.25rem; }
	h3 { font-size: 1rem; }

	article + article {
		border-top: 1px solid #ddd;
	}
</style>
