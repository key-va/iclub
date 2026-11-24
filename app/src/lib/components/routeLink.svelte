<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		href = '',
		title = 'Title',
		description = '',
		image = '',
		isWhite = false,
		detail,
		icon,
		label
	}: {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		isWhite?: boolean;
		detail?: Snippet;
		icon?: Snippet;
		label?: string;
	} = $props();
</script>

<div class={isWhite ? 'group' : ''}>
	<a class="route-link" {href} aria-label={label}>
		<div class="row right">
			<p class="truncate">
				<strong>{title}</strong>{#if description || detail}<br /><span
						class="description row-description"
					>
						{description}{#if description && detail}{' • '}{/if}{@render detail?.()}
					</span>{/if}
			</p>
			<div
				class="round-icon-small"
				class:blue={!icon}
				class:neutral-icon={!!icon}
				style:background-image={image && !icon ? `url('${image}')` : undefined}
			>
				{#if icon || !image}
					<svg
						viewBox="0 0 24 24"
						width="1rem"
						height="1rem"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						{#if icon}{@render icon()}{:else}<path d="M5 12h14M13 5l7 7-7 7" />{/if}
					</svg>
				{/if}
			</div>
		</div>
	</a>
</div>

<style>
	.route-link {
		color: inherit;
		text-decoration: none;
	}
	.neutral-icon {
		background: gainsboro;
		color: #0d0d0d;
		border-color: white;
	}
</style>
