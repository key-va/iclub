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

	onMount(() => { void loadHelpStrings(); });
</script>

{#each paragraphs as paragraph, index}
	{@const dot = /^(red|orange|blue|green|grey|gray):\s*(\S.*)$/is.exec(paragraph.trim())}
	<p class="info">
		{#if index === 0 && label}<strong>{label}</strong><br />{/if}
		{#if dot}<StatusDot colour={dot[1].toLowerCase()} label={dot[1]} />{dot[2]}{:else}{paragraph}{/if}
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
