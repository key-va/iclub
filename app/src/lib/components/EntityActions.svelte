<script lang="ts">
	import type { Snippet } from 'svelte';
	import HiddenOptions from './hiddenOptions.svelte';
	let {
		summary = '',
		more = false,
		help,
		children,
		options
	}: {
		summary?: string;
		more?: boolean;
		help?: Snippet;
		children?: Snippet;
		options?: Snippet;
	} = $props();
	let showHelp = $state(false);
</script>

{#if summary}<div class="group"><p class="info center">{summary}</p></div>{/if}
{#if showHelp && help}<div class="group help">{@render help()}</div>{/if}
{#snippet controls()}
	{#if help}<button
			class="blue"
			aria-label="help"
			aria-expanded={showHelp}
			onclick={() => (showHelp = !showHelp)}
		>
			<p>?</p>
		</button>{/if}
	{@render children?.()}
{/snippet}
{#if more}
	<HiddenOptions title="More Options">
		<div class="row right controls">
			{@render controls()}{@render options?.()}
		</div>
	</HiddenOptions>
{:else}
	<div class="row right controls">{@render controls()}</div>
	{#if options}<HiddenOptions title="More Options">
			<div class="row right controls">{@render options()}</div>
		</HiddenOptions>{/if}
{/if}

<style>
	.controls {
		flex-wrap: wrap;
	}
</style>
