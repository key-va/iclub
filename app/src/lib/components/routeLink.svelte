<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';

	const iconPaths = {
		right_arrow: 'M5 12h14M13 5l7 7-7 7',
		down_chevron: 'M6 9l6 6 6-6',
		// points left and turns to point right while the options are open
		chev: 'M15 6l-6 6 6 6',
		dash: 'M5 12h14',
		plus: 'M12 5v14M5 12h14'
	};

	type IconName = keyof typeof iconPaths;

	interface Props {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		// drawn over the image when both are supplied; defaults to plus (more options) or right_arrow, and to none when there is an image
		icon?: IconName;
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
		icon,
		isWhite = false,
		hasMoreOptions = false,
		timeout = 9000,
		children
	}: Props = $props();

	const glyphName = $derived<IconName | undefined>(
		icon ?? (image === '' ? (hasMoreOptions ? 'plus' : 'right_arrow') : undefined)
	);

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

{#snippet glyph()}
	{#if glyphName}
		<svg class:over-image={image !== ''} class:turn={glyphName === 'chev'} class:turned={glyphName === 'chev' && open} viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
			<path d={iconPaths[glyphName]} />
		</svg>
	{/if}
{/snippet}

<div class={isWhite ? 'group' : ''}>
	{#if hasMoreOptions}
		<div class="row right">
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
				class="blue icon-button"
				aria-label={title}
				aria-expanded={open}
				style="background-image: url('{image}');"
				onclick={iconTap}
			>
				{@render glyph()}
			</button>
		</div>
	{:else}
		<a class="route-link" {href}>
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

	.turn {
		transition: transform 0.2s;
	}

	.turned {
		transform: rotate(180deg);
	}

	/* keeps the icon legible when drawn over an image */
	.over-image {
		filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
	}
</style>
