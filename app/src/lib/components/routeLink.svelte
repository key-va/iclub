<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		isWhite?: boolean;
		// ms of inactivity before revealed options revert
		timeout?: number;
		// ms the row must be held to reveal the options
		holdTime?: number;
		// options revealed by a long press (or right click, or Shift+Enter)
		children?: Snippet;
	}

	let {
		href = '',
		title = 'Title',
		description = '',
		image = '',
		isWhite = false,
		timeout = 9000,
		holdTime = 500,
		children
	}: Props = $props();

	let open = $state(false);
	// bumped on any interaction so the countdown restarts while the options are in use
	let activity = $state(0);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	// the click that follows a long press must not navigate
	let held = false;
	let openedAt = 0;

	$effect(() => {
		if (!open) return;

		activity;

		const timer = setTimeout(() => (open = false), timeout);

		return () => clearTimeout(timer);
	});

	function reveal() {
		if (!children || open) return;
		held = true;
		openedAt = Date.now();
		open = true;
		navigator.vibrate?.(30);
	}

	function holdStart() {
		if (!children) return;
		held = false;
		clearTimeout(holdTimer);
		holdTimer = setTimeout(reveal, holdTime);
	}

	function holdCancel() {
		clearTimeout(holdTimer);
	}

	function onclick(event: MouseEvent) {
		if (held) {
			event.preventDefault();
			held = false;
		}
	}

	function oncontextmenu(event: MouseEvent) {
		if (!children) return;
		event.preventDefault();
		reveal();
	}

	function onkeydown(event: KeyboardEvent) {
		if (children && ((event.key === 'Enter' && event.shiftKey) || event.key === 'ContextMenu')) {
			event.preventDefault();
			reveal();
		}
	}

	function close() {
		// ignore the release of the press that opened the options
		if (Date.now() - openedAt < 400) return;
		open = false;
	}
</script>

{#snippet glyph()}
	{#if image === ''}
		<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
			<path d="M5 12h14M13 5l7 7-7 7" />
		</svg>
	{/if}
{/snippet}

<div class={isWhite ? 'group' : ''}>
	{#if open}
		<div class="row right">
			<div
				class="options"
				role="group"
				aria-label={`${title} options`}
				onpointerdown={() => activity++}
				onfocusin={() => activity++}
			>
				{@render children?.()}
			</div>
			<button class="blue icon-button" aria-label={`close ${title} options`} style="background-image: url('{image}');" onclick={close}>
				{@render glyph()}
			</button>
		</div>
	{:else}
		<a
			class="route-link"
			{href}
			{onclick}
			{oncontextmenu}
			{onkeydown}
			onpointerdown={holdStart}
			onpointerup={holdCancel}
			onpointerleave={holdCancel}
			onpointercancel={holdCancel}
		>
			<div class="row right">
				<p class="truncate"><strong>{title}</strong><br />{description}</p>
				<div class="round-icon-small blue" style="background-image: url('{image}');">
					{@render glyph()}
				</div>
			</div>
		</a>
	{/if}
</div>

<style>
	.route-link {
		color: inherit;
		text-decoration: none;
		/* stop the browser's own long-press menu and text selection getting in the way */
		-webkit-touch-callout: none;
		user-select: none;
	}

	.options {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		white-space: nowrap;
	}

	/* the global .blue shorthand resets the button's background size and position, so restate them for the image */
	.icon-button {
		background-size: cover;
		background-position: center;
	}
</style>
