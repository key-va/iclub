<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';

	interface Props {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		isWhite?: boolean;
		// when true the icon becomes a button that reveals the children instead of the title and description
		hasMoreOptions?: boolean;
		// ms of inactivity before the revealed options revert
		timeout?: number;
		children?: Snippet;
	}

	let {
		href = '',
		title = 'Title',
		description = 'description',
		image = '',
		isWhite = false,
		hasMoreOptions = false,
		timeout = 9000,
		children
	}: Props = $props();

	let open = $state(false);
	// bumped on any interaction so the countdown restarts while the options are in use
	let activity = $state(0);

	$effect(() => {
		if (!open) return;

		activity;

		const timer = setTimeout(() => (open = false), timeout);

		return () => clearTimeout(timer);
	});

	function iconTap() {
		if (!open) {
			open = true;
			return;
		}

		open = false;
		if (href) goto(href);
	}
</script>

{#snippet icon()}
	{#if image === ''}
		{#if hasMoreOptions}
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
				<path d="M12 5v14M5 12h14" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
				<path d="M5 12h14M13 5l7 7-7 7" />
			</svg>
		{/if}
	{/if}
{/snippet}

<div>
	{#if hasMoreOptions}
		<div class="row right {isWhite ? 'white' : ''}">
			{#if open}
				<div
					class="options"
					role="group"
					aria-label={`${title} options`}
					onpointerdown={() => activity++}
					onfocusin={() => activity++}
				>
					{@render children?.()}
				</div>
			{:else}
				<p class="truncate"><strong>{title}</strong><br />{description}</p>
			{/if}
			<button
				class="blue"
				aria-label={title}
				aria-expanded={open}
				style="background-image: url('{image}');"
				onclick={iconTap}
			>
				{@render icon()}
			</button>
		</div>
	{:else}
		<a class="route-link" {href}>
			<div class="row right {isWhite ? 'white' : ''}">
				<p class="truncate"><strong>{title}</strong><br />{description}</p>
				<div class="round-icon-small blue" style="background-image: url('{image}');">
					{@render icon()}
				</div>
			</div>
		</a>
	{/if}
</div>

<style>
	.route-link {
		color: inherit;
		text-decoration: none;
	}

	.options {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		white-space: nowrap;
	}
</style>
