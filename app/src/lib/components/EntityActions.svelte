<script lang="ts">
	import type { Snippet } from 'svelte';
	import HiddenOptions from './hiddenOptions.svelte';
	let {
		summary = '',
		help,
		children,
		moreOptions
	}: {
		summary?: string;
		help?: Snippet;
		children?: Snippet;
		moreOptions?: Snippet;
	} = $props();
	let showHelp = $state(false);
</script>

{#if summary}
	<div class="group"><p class="info center description">{summary}</p></div>
{/if}
{#if showHelp && help}<div class="group help">{@render help()}</div>{/if}
{#if children || moreOptions || help}
	<div class="row right controls action-row">
		{@render children?.()}
		{#if moreOptions}
			<HiddenOptions buttonOnly title="More Options">
				{@render moreOptions()}
			</HiddenOptions>
		{/if}
		{#if help}
			<button type="button" class="blue" aria-label="help" aria-expanded={showHelp}
				onclick={() => (showHelp = !showHelp)}>
				<p>?</p>
			</button>
		{/if}
	</div>
{/if}

<style>
	.controls {
		flex-wrap: wrap;
	}
</style>
