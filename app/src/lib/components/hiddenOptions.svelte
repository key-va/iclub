<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		description?: string;
		// text shown in the round icon instead of the dots/dash glyph
		badge?: string | number;
		isWhite?: boolean;
		// true shows the content in place of the title (action buttons); false shows it below the row (help text)
		inline?: boolean;
		// ms of inactivity before the content hides again; 0 keeps it until tapped again
		timeout?: number;
		// the hidden content; without it the row is plain information
		children?: Snippet;
	}

	let {
		title,
		description,
		badge,
		isWhite = false,
		inline = false,
		timeout = inline ? 9000 : 0,
		children
	}: Props = $props();

	let open = $state(false);
	// bumped on any interaction so the countdown restarts while the content is in use
	let activity = $state(0);

	$effect(() => {
		if (!open || !timeout) return;

		activity;

		const timer = setTimeout(() => (open = false), timeout);

		return () => clearTimeout(timer);
	});
</script>

{#snippet glyph()}
	<!-- three centred dots while collapsed; a dash while expanded or when there is nothing to show -->
	{#if badge !== undefined}
		<strong>{badge}</strong>
	{:else}
		<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
			{#if children && !open}
				<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="4" />
			{:else}
				<path d="M5 12h14" />
			{/if}
		</svg>
	{/if}
{/snippet}

<div class={isWhite ? 'group' : ''}>
	<div class="row right">
		{#if open && inline}
			<div class="content inline" role="group" aria-label={`${title} options`} onpointerdown={() => activity++} onfocusin={() => activity++}>
				{@render children?.()}
			</div>
		{:else}
			<p class="truncate"><strong>{title}</strong>{#if description}<br />{description}{/if}</p>
		{/if}

		{#if children}
			<button class="blue" aria-label={title} aria-expanded={open} onclick={() => (open = !open)}>
				{@render glyph()}
			</button>
		{:else}
			<div class="round-icon-small {badge !== undefined ? 'grey' : 'blue'}">
				{@render glyph()}
			</div>
		{/if}
	</div>

	{#if open && !inline}
		<div class="content details" role="group" aria-label={title} onpointerdown={() => activity++} onfocusin={() => activity++}>
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.inline {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		white-space: nowrap;
	}

	.details > :global(p) {
		padding: 0.5em 2em;
	}

</style>
