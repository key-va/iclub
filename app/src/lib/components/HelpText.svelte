<script lang="ts">
	import { onMount } from 'svelte';
	import { helpStrings, loadHelpStrings } from '#lib/stores/helpStrings.ts';

	let { topic, label }: { topic: string; label?: string } = $props();

	const strings = $derived($helpStrings.status === 'ready' ? $helpStrings.strings : undefined);
	const short = $derived(strings?.[topic]);
	const long = $derived(strings?.[`${topic}.long`]);
	const paragraphs = $derived([
		...(typeof short === 'string' && short.trim() ? [short] : []),
		...(Array.isArray(long) ? long.filter((paragraph) => paragraph.trim()) : [])
	]);

	onMount(() => { void loadHelpStrings(); });
</script>

{#each paragraphs as paragraph, index}
	<p class="info">{#if index === 0 && label}<strong>{label}</strong><br />{/if}{paragraph}</p>
{:else}
	{#if topic.startsWith('feature.')}
		{#if $helpStrings.status === 'idle' || $helpStrings.status === 'loading'}
			<p class="info" role="status">Loading help…</p>
		{:else}
			<p class="info">Help is unavailable.</p>
		{/if}
	{/if}
{/each}
