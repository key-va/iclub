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

{#if summary}<div class="group">
		<p class="info center description">{summary}</p>
	</div>{/if}
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
	<HiddenOptions inline title="More Options">
		{@render controls()}{@render options?.()}
	</HiddenOptions>
{:else}
	{#if help || children}<div class="row right controls">
			{@render controls()}
		</div>{/if}
	{#if options}<HiddenOptions inline title="More Options">
			{@render options()}
		</HiddenOptions>{/if}
{/if}

<style>
	.controls {
		flex-wrap: wrap;
	}
</style>
