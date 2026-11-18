<script lang="ts">
	import type { Snippet } from 'svelte';
	let { href = '', title = 'Title', description = '', image = '', isWhite = false, detail }: {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		isWhite?: boolean;
		detail?: Snippet;
	} = $props();
</script>

<div class={isWhite ? 'group' : ''}>
	<a class="route-link" {href}>
		<div class="row right">
			<p class="truncate"><strong>{title}</strong>{#if description || detail}<br />{description}{/if}{@render detail?.()}</p>
			<div class="round-icon-small blue" style="background-image: url('{image}');">
				{#if !image}
					<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M5 12h14M13 5l7 7-7 7" />
					</svg>
				{/if}
			</div>
		</div>
	</a>
</div>

<style>
	.route-link { color: inherit; text-decoration: none; }
</style>
