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

{#if section !== 'options' && (summary || help)}
	<div class="group">
		{#if summary}<p class="info center description">{summary}</p>{/if}
		{#if help}
			<div class="row center">
				<button
					type="button"
					class="blue"
					aria-label={showHelp ? 'hide help' : 'help'}
					aria-expanded={showHelp}
					onclick={() => (showHelp = !showHelp)}
				>
					<p aria-hidden="true">{showHelp ? '×' : '?'}</p>
				</button>
			</div>
		{/if}
	</div>
{/if}
{#if section !== 'options' && showHelp && help}
	<div class="group help">{@render help()}</div>
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
	.help {
		text-align: left;
	}

	.controls {
		flex-wrap: wrap;
	}
</style>
