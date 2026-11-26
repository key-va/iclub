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
				<p aria-hidden="true">{open ? '×' : '?'}</p>
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
