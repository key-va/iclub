<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { trackActions } from './actionActivity.ts';

	interface Props {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		isWhite?: boolean;
		// ms of inactivity before revealed options revert
		timeout?: number;
		// extra content after the description (eg. a status dot and rank)
		detail?: Snippet;
		// actions revealed by a normal tap, alongside the navigation link
		children?: Snippet;
	}

	let {
		href = '', title = 'Title', description = '', image = '',
		isWhite = false, timeout = 9000, detail, children,
	}: Props = $props();

	const optionsId = $props.id();
	let open = $state(false);
	let activity = $state(0);
	let pendingActions = $state(0);
	let optionsNode = $state<HTMLDivElement>();
	let triggerButton = $state<HTMLButtonElement>();

	$effect(() => {
		if (!open || pendingActions) return;
		activity;
		const timer = setTimeout(close, timeout);
		return () => clearTimeout(timer);
	});

	async function reveal() {
		open = true;
		await tick();
		optionsNode?.querySelector<HTMLElement>('button:not(:disabled), a[href], input, select, textarea')?.focus();
	}

	async function close() {
		if (pendingActions) return;
		const restoreFocus = optionsNode?.contains(document.activeElement);
		open = false;
		if (restoreFocus) {
			await tick();
			triggerButton?.focus();
		}
	}

	function onActionActivity(count: number) {
		pendingActions = count;
		activity++;
	}

	// Handle bubbled keys from the buttons/links; the group itself need not be focusable.
	function trackOptions(node: HTMLElement) {
		const tracking = trackActions(node, onActionActivity);
		node.addEventListener('keydown', onkeydown);
		return { destroy() {
			tracking.destroy();
			node.removeEventListener('keydown', onkeydown);
		} };
	}

	function onkeydown(event: KeyboardEvent) {
		activity++;
		if (event.key === 'Escape' && !pendingActions) {
			event.preventDefault();
			close();
		}
	}
</script>

{#snippet arrow()}
	<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M5 12h14M13 5l7 7-7 7" />
	</svg>
{/snippet}

<div class={isWhite ? 'group' : ''}>
	{#if open}
		<div class="row right">
			<div
				bind:this={optionsNode}
				id={optionsId}
				class="options"
				role="group"
				aria-label={`${title} options`}
				use:trackOptions
				onpointerdown={() => activity++}
				onfocusin={() => activity++}
			>
				{@render children?.()}
				<a class="blue navigation-button" {href} aria-disabled={pendingActions > 0}
					onclick={(event) => { if (pendingActions) event.preventDefault(); }}>
					<p class="truncate">{title}</p>
					{@render arrow()}
				</a>
			</div>
		</div>
	{:else}
		<button bind:this={triggerButton} type="button" class="route-link"
			aria-label={`show ${title} options`} aria-expanded={false} aria-controls={optionsId} onclick={reveal}>
			<div class="row right">
				<p class="truncate"><strong>{title}</strong>{#if description || detail}<br />{description}{/if}{#if detail}{@render detail()}{/if}</p>
				<div class="round-icon-small blue" style="background-image: url('{image}');">
					{#if image === ''}{@render arrow()}{/if}
				</div>
			</div>
		</button>
	{/if}
</div>

<style>
	.route-link {
		display: block;
		width: 100%;
		height: auto;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
		color: inherit;
		font: inherit;
		line-height: normal;
		text-align: inherit;
		cursor: pointer;
	}

	.route-link:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -2px;
	}

	.options {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.navigation-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		max-width: 100%;
		min-height: 3rem;
		padding: 0.5rem;
		margin: 0.5rem;
		border: 2px solid white;
		border-radius: 9rem;
		text-decoration: none;
	}

	.navigation-button[aria-disabled='true'] {
		opacity: 0.6;
		cursor: wait;
	}
</style>
