<script lang="ts">
	import type { Snippet } from 'svelte';
	let { summary = '', help, children }: { summary?: string; help?: Snippet; children?: Snippet } = $props();
	let open = $state(false);
</script>

<div class="group">
	{#if summary}<p class="info center description">{summary}</p>{/if}
	{@render children?.()}
	{#if help}
		<div class="row center">
			<button type="button" class="blue" aria-label={open ? 'hide help' : 'help'}
				aria-expanded={open} onclick={() => (open = !open)}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem"
					fill="none" stroke="currentColor" stroke-width="3"
					stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if open}
						<path d="M18 6 6 18M6 6l12 12" />
					{:else}
						<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18h.01" />
					{/if}
				</svg>
			</button>
		</div>
	{/if}
</div>
{#if open && help}
	<div class="group help">{@render help()}</div>
{/if}

<style>
	.help { text-align: left; }
</style>
