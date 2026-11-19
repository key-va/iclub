<script lang="ts">
	import type { Snippet } from 'svelte';
	import HiddenOptions from './hiddenOptions.svelte';
	let {
		summary = '',
		more = false,
		help,
		children
	}: {
		summary?: string;
		more?: boolean;
		help?: Snippet;
		children?: Snippet;
	} = $props();
	let showHelp = $state(false);
</script>

{#if summary}<div class="group"><p class="info center">{summary}</p></div>{/if}
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
		<div class="row right controls">{@render controls()}</div>
	</HiddenOptions>
{:else}
	<div class="group">
		<div class="row right controls">{@render controls()}</div>
	</div>
{/if}
{#if showHelp && help}<div class="group help">{@render help()}</div>{/if}

<style>
	.controls {
		flex-wrap: wrap;
	}
</style>
