<script lang="ts">
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
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
</script>

{#if section !== 'options' && (summary || help)}
	<SummaryHelp {summary} {help} />
{/if}
{#if more && section !== 'primary'}
	<HiddenOptions inline title="More Options">
		{@render children?.()}{@render options?.()}
	</HiddenOptions>
{:else if !more}
	{#if section !== 'options' && children}<div
			class="row right controls action-row"
		>
			{@render children?.()}
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
