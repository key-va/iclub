<script lang="ts">
	import type { Snippet } from 'svelte';
	import HiddenOptions from './hiddenOptions.svelte';
	let {
		summary = '',
		section = 'all',
		more = false,
		help,
		children,
		options
	}: {
		summary?: string;
		section?: 'all' | 'primary' | 'options';
		more?: boolean;
		help?: Snippet;
		children?: Snippet;
		options?: Snippet;
	} = $props();
	let showHelp = $state(false);
</script>

{#if section !== 'options'}
	{#if summary}<div class="group">
			<p class="info center description">{summary}</p>
		</div>{/if}
{/if}
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
{#if more && section !== 'primary'}
	<HiddenOptions inline title="More Options">
		{@render controls()}{@render options?.()}
	</HiddenOptions>
{:else if !more}
	{#if section !== 'options' && (help || children)}<div
			class="row right controls"
		>
			{@render controls()}
		</div>{/if}
	{#if options && section !== 'primary'}<HiddenOptions
			inline
			title="More Options"
		>
			{@render options()}
		</HiddenOptions>{/if}
{/if}

<style>
	.controls {
		flex-wrap: wrap;
	}
</style>
