<script lang="ts">
	import type { Snippet } from 'svelte';
	import PageActions from './PageActions.svelte';
	let { summary = '', help, children, actions }: { summary?: string; help?: Snippet; children?: Snippet; actions?: Snippet } = $props();
	let open = $state(false);
</script>

<div class="group">
	{#if summary}<p class="info center description">{summary}</p>{/if}
	{@render children?.()}
</div>
{#if open && help}
	<div class="group help">{@render help()}</div>
{/if}

{#if actions || help}
	<PageActions {open} onclick={help ? () => (open = !open) : undefined} children={actions} />
{/if}

<style>
	.help { text-align: left; }
</style>
