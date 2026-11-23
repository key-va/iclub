<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import RouteLink from './routeLink.svelte';
	import { trackActions } from './actionActivity.ts';

	let {
		href = '',
		title = 'Title',
		description = '',
		image = '',
		colour = 'var(--brand-foreground, #FF1493)',
		isWhite = false,
		detail,
		currentSelection,
		children
	}: {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		colour?: string;
		isWhite?: boolean;
		detail?: Snippet;
		children?: Snippet;
		currentSelection?: string;
	} = $props();

	const hasOptions = $derived(!!(children || currentSelection));
	const optionsId = $props.id();
	let open = $state(false);
	let pendingActions = $state(0);
	let busyActions = $state(0);
	const busy = $derived(busyActions > 0);
	let dotButton = $state<HTMLButtonElement>();
	let closeButton = $state<HTMLButtonElement>();
	let actionsNode = $state<HTMLFieldSetElement>();

	$effect(() => {
		if (!hasOptions) {
			open = false;
			pendingActions = 0;
			busyActions = 0;
		}
	});

	async function reveal() {
		open = true;
		await tick();
		const firstAction = actionsNode?.querySelector<HTMLElement>(
			'button:not(:disabled), a[href], input, select, textarea'
		);
		(firstAction ?? closeButton)?.focus();
	}

	async function close() {
		if (pendingActions) return;
		open = false;
		await tick();
		dotButton?.focus();
	}

	function trackOptions(node: HTMLElement) {
		const tracking = trackActions(node, (count) => {
			pendingActions = count;
		});
		const activity = trackActions(node, (count) => {
			busyActions = count;
		}, 'api-action-busy');
		const onkeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !pendingActions) {
				event.preventDefault();
				close();
			}
		};
		node.addEventListener('keydown', onkeydown);
		return {
			destroy() {
				tracking.destroy();
				activity.destroy();
				node.removeEventListener('keydown', onkeydown);
			}
		};
	}
</script>

{#if !hasOptions}
	<RouteLink {href} {title} {description} {image} {isWhite} {detail} />
{:else}
	<div class={isWhite ? 'group' : ''}>
		<div class="row right">
			{#if open}
				<fieldset
					bind:this={actionsNode}
					id={optionsId}
					class="actions"
					disabled={busy}
					aria-busy={busy}
					aria-label={`Actions for ${title}`}
					use:trackOptions
				>
					{#if children}
						{@render children()}
					{:else}
						<button type="button" class="grey" disabled><p>{currentSelection}</p></button>
					{/if}
				</fieldset>
				<button
					bind:this={closeButton}
					type="button"
					class={`round-icon-small close-button ${busy ? 'grey' : 'blue'}`}
					aria-label={busy ? `Action in progress for ${title}` : `Close actions for ${title}`}
					disabled={busy || pendingActions > 0}
					onclick={close}
				>
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
						{#if busy}
							<path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4" />
						{:else}
							<path d="M6 6l12 12M18 6 6 18" />
						{/if}
					</svg>
				</button>
			{:else}
				<p class="truncate">
					<strong>{title}</strong>{#if description || detail}<br /><span
							class="description route-link-description"
						>
							{description}{#if description && detail}{' • '}{/if}{@render detail?.()}
						</span>{/if}
				</p>
				<button
					bind:this={dotButton}
					type="button"
					class="dot-button"
					aria-label={`Actions for ${title}`}
					aria-expanded={false}
					aria-controls={optionsId}
					onclick={reveal}
				>
					<span class="action-dot" style:background={colour} aria-hidden="true"
					></span>
				</button>
				<a
					class="round-icon-small blue entity-link"
					{href}
					aria-label={`Open ${title}`}
					style:background-image={`url('${image}')`}
				>
					{#if !image}
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
							<path d="M5 12h14M13 5l7 7-7 7" />
						</svg>
					{/if}
				</a>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dot-button {
		flex-shrink: 0;
		width: 44px;
		min-width: 44px;
		height: 44px;
		padding: 0;
		margin: 0;
		border: 0;
		background: none;
	}
	.action-dot {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid white;
		border-radius: 50%;
	}
	.entity-link,
	.close-button {
		flex-shrink: 0;
	}
	.entity-link {
		text-decoration: none;
	}
	.close-button {
		padding: 0;
		border-radius: 50%;
	}
	.actions {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	.actions:disabled > :global(button) {
		background: lightgrey;
		color: white;
		cursor: default;
	}
</style>
