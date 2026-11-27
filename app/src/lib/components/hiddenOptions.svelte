<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { trackActions } from './actionActivity.ts';

	interface Props {
		title?: string;
		description?: string;
		// Extra inline detail, matching routeLink (for example coloured status separators).
		detail?: Snippet;
		// text shown in the round icon instead of the dots/dash glyph
		badge?: string | number;
		isWhite?: boolean;
		helpIcon?: boolean;
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
		detail,
		badge,
		isWhite = false,
		helpIcon = false,
		inline = false,
		timeout,
		children
	}: Props = $props();

	const moreOptions = $derived(title === 'More Options' || title === 'More');
	const replaceRow = $derived(inline || moreOptions);
	const revertAfter = $derived(
		moreOptions ? 9000 : (timeout ?? (replaceRow ? 9000 : 0))
	);
	let toggleButton = $state<HTMLButtonElement>();
	let contentNode = $state<HTMLDivElement>();

	let open = $state(false);
	// bumped on any interaction so the countdown restarts while the content is in use
	let activity = $state(0);
	let pendingActions = $state(0);

	$effect(() => {
		if (!open || !revertAfter || pendingActions) return;

		activity;

		const timer = setTimeout(async () => {
			const restoreFocus = contentNode?.contains(document.activeElement);
			open = false;
			await tick();
			if (restoreFocus) toggleButton?.focus();
		}, revertAfter);

		return () => clearTimeout(timer);
	});

	async function toggle() {
		open = !open;
		if (open && replaceRow) {
			await tick();
			contentNode
				?.querySelector<HTMLElement>('button:not(:disabled), a[href]')
				?.focus();
		}
	}

	function onActionActivity(count: number) {
		pendingActions = count;
		activity++;
	}
</script>

{#snippet glyph()}
	<!-- three centred dots while collapsed; a dash while expanded or when there is nothing to show -->
	{#if badge !== undefined}
		<strong>{badge}</strong>
	{:else}
		<svg
			viewBox="0 0 24 24"
			width="1rem"
			height="1rem"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			role="img"
		>
			{#if helpIcon && children}
				{#if open}
					<path d="M18 6 6 18M6 6l12 12" />
				{:else}
					<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18h.01" />
				{/if}
			{:else if children && !open}
				<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="4" />
			{:else}
				<path d="M5 12h14" />
			{/if}
		</svg>
	{/if}
{/snippet}

<div class={isWhite ? 'group' : ''}>
	<div class="row right">
		{#if open && replaceRow}
			<div
				bind:this={contentNode}
				class="content inline"
				class:action-row={moreOptions}
				role="group"
				aria-label={`${title} options`}
				use:trackActions={onActionActivity}
				onpointerdown={() => activity++}
				onfocusin={() => activity++}
			>
				{@render children?.()}
			</div>
		{:else}
			<p class="truncate">
				<strong>{title}</strong>{#if description || detail}<br /><span
						class="description row-description"
					>
						{description}{@render detail?.()}
					</span>{/if}
			</p>
		{/if}

		{#if children && (!open || !replaceRow)}
			<button
				bind:this={toggleButton}
				class="blue"
				aria-label={title}
				aria-expanded={open}
				disabled={pendingActions > 0}
				onclick={toggle}
			>
				{@render glyph()}
			</button>
		{:else if !children}
			<div class="round-icon-small {badge !== undefined ? 'grey' : 'blue'}">
				{@render glyph()}
			</div>
		{/if}
	</div>

	{#if open && !replaceRow}
		<div
			class="content details"
			class:action-row={moreOptions}
			role="group"
			aria-label={title}
			use:trackActions={onActionActivity}
			onpointerdown={() => activity++}
			onfocusin={() => activity++}
		>
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.inline {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
	}

	.details > :global(p) {
		padding: 0.5em 2em;
	}

</style>
