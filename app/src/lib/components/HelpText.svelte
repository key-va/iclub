<script lang="ts">
	import StatusDot from './StatusDot.svelte';
	import { onMount } from 'svelte';
	import { helpStrings, loadHelpStrings } from '#lib/stores/helpStrings.ts';

	let { topic, label, longOnly = false }: { topic: string; label?: string; longOnly?: boolean } = $props();

	const strings = $derived($helpStrings.status === 'ready' ? $helpStrings.strings : undefined);
	const short = $derived(strings?.[topic]);
	const long = $derived(strings?.[`${topic}.long`]);
	const paragraphs = $derived([
		...(!longOnly && typeof short === 'string' && short.trim() ? [short] : []),
		...(Array.isArray(long) ? long.filter((paragraph) => paragraph.trim()) : [])
	]);

	const blocks = $derived.by(() => {
		const blocks: { text: string; dots: { colour: string; text: string }[] }[] = [];
		for (const paragraph of paragraphs) {
			const dot = /^(red|orange|blue|green|grey|gray):\s*(\S.*)$/is.exec(paragraph.trim());
			if (!dot) {
				blocks.push({ text: paragraph, dots: [] });
				continue;
			}

			const previous = blocks.at(-1);
			const entry = { colour: dot[1], text: dot[2] };
			if (previous?.dots.length) {
				previous.dots.push(entry);
			} else {
				blocks.push({ text: '', dots: [entry] });
			}
		}
		return blocks;
	});

	onMount(() => { void loadHelpStrings(); });
</script>

{#each blocks as block, index}
	<p class="info">
		{#if index === 0 && label}<strong>{label}</strong><br />{/if}
		{#if block.dots.length}
			{#each block.dots as { colour, text }, dotIndex}
				{#if dotIndex > 0}<br />{/if}<StatusDot colour={colour.toLowerCase()} label={colour} />{text}
			{/each}
		{:else}
			{block.text}
		{/if}
	</p>
{:else}
	{#if !longOnly && topic.startsWith('feature.')}
		{#if $helpStrings.status === 'idle' || $helpStrings.status === 'loading'}
			<p class="info" role="status">Loading help…</p>
		{:else}
			<p class="info">Help is unavailable.</p>
		{/if}
	{/if}
{/each}
