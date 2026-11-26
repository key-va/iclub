<script lang="ts">
	import type { Snippet } from 'svelte';
	let { open = false, onclick, children }: { open?: boolean; onclick?: () => void; children?: Snippet } = $props();
</script>

<div class="row right action-row page-actions">
	{@render children?.()}
	{#if onclick}
		<button type="button" class="grey no-page-actions" disabled><p>no actions</p></button>
		<button type="button" class="blue help-toggle" aria-label={open ? 'hide help' : 'help'}
			aria-expanded={open} {onclick}>
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
	{/if}
</div>
