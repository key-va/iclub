<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import RouteLink from './routeLink.svelte';
	import { trackActions } from './actionActivity.ts';

	let { href = '', title = 'Title', description = '', image = '',
		colour = 'var(--brand-foreground, #FF1493)', isWhite = false, detail, children,
	}: {
		href?: string;
		title?: string;
		description?: string;
		image?: string;
		colour?: string;
		isWhite?: boolean;
		detail?: Snippet;
		children?: Snippet;
	} = $props();

	const optionsId = $props.id();
	let open = $state(false);
	let pendingActions = $state(0);
	let dotButton = $state<HTMLButtonElement>();
	let closeButton = $state<HTMLButtonElement>();
	let actionsNode = $state<HTMLDivElement>();

	$effect(() => {
		if (!children) { open = false; pendingActions = 0; }
	});

	async function reveal() {
		open = true;
		await tick();
		const firstAction = actionsNode?.querySelector<HTMLElement>('button:not(:disabled), a[href], input, select, textarea');
		(firstAction ?? closeButton)?.focus();
	}

	async function close() {
		if (pendingActions) return;
		open = false;
		await tick();
		dotButton?.focus();
	}

	function trackOptions(node: HTMLElement) {
		const tracking = trackActions(node, count => { pendingActions = count; });
		const onkeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !pendingActions) { event.preventDefault(); close(); }
		};
		node.addEventListener('keydown', onkeydown);
		return { destroy() { tracking.destroy(); node.removeEventListener('keydown', onkeydown); } };
	}
</script>

{#if !children}
	<RouteLink {href} {title} {description} {image} {isWhite} {detail} />
{:else}
	<div class={isWhite ? 'group' : ''}>
		<div class="row right">
			{#if open}
				<div bind:this={actionsNode} id={optionsId} class="actions" role="group" aria-label={`Actions for ${title}`} use:trackOptions>
					{@render children()}
				</div>
				<button bind:this={closeButton} type="button" class="round-icon-small blue close-button" aria-label={`Close actions for ${title}`}
					disabled={pendingActions > 0} onclick={close}>
					<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6 6 18" />
					</svg>
				</button>
			{:else}
				<p class="truncate"><strong>{title}</strong>{#if description || detail}<br />{description}{/if}{#if detail} {@render detail()}{/if}</p>
				<button bind:this={dotButton} type="button" class="dot-button" aria-label={`Actions for ${title}`}
					aria-expanded={false} aria-controls={optionsId} onclick={reveal}>
					<span class="action-dot" style:background={colour} aria-hidden="true"></span>
				</button>
				<a class="round-icon-small blue entity-link" {href} aria-label={`Open ${title}`} style:background-image={`url('${image}')`}>
					{#if !image}
						<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
	.entity-link, .close-button { flex-shrink: 0; }
	.entity-link { text-decoration: none; }
	.close-button { padding: 0; border-radius: 50%; }
	.actions {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
</style>
