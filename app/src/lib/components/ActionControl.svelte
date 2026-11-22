<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { ApiResponse } from '#lib/stores/remote.ts';

	export interface ActionProps {
		name?: string;
		message?: string;
		action: () => Promise<ApiResponse>;
		disabled?: boolean;
		inline?: boolean;
		tone?: 'blue' | 'green' | 'orange';
		label?: string;
		arrow?: boolean;
		showLabel?: boolean;
		onsuccess?: (result: ApiResponse) => void | Promise<void>;
		children?: Snippet;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { navigationHref } from '#lib/stores/remote.ts';

	let {
		name = 'do action',
		message = 'are you sure?',
		action,
		confirm,
		navigate,
		disabled = false,
		inline = false,
		tone,
		label,
		arrow = false,
		showLabel = false,
		onsuccess,
		children
	}: ActionProps & { confirm: boolean; navigate: boolean } = $props();

	let isExpanded = $state(false);
	let isBusy = $state(false);
	let isError = $state(false);
	let shown = $state('');
	let triggerButton: HTMLButtonElement;

	let originX = $state(0);
	let originY = $state(0);

	function start(event: MouseEvent) {
		if (disabled || isBusy || isExpanded) return;
		completed = null;
		retryAction = undefined;
		originX = event.clientX;
		originY = event.clientY;
		shown = message;
		isError = false;
		triggerButton?.dispatchEvent(
			new CustomEvent('api-action-state', { bubbles: true, detail: true })
		);

		// without confirmation the button itself shows progress; the overlay only appears for an error
		if (confirm) isExpanded = true;
		else execute();
	}

	function close() {
		isExpanded = false;
		isBusy = false;
		isError = false;
		triggerButton?.dispatchEvent(
			new CustomEvent('api-action-state', { bubbles: true, detail: false })
		);
	}

	function radiusFrom(x: number, y: number) {
		return Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y)
		);
	}

	function wipeIn(
		_node: Element,
		{ x, y, duration = 350 }: { x: number; y: number; duration?: number }
	) {
		const radius = radiusFrom(x, y);

		return {
			duration,
			easing: cubicIn,
			css: (t: number) => `clip-path: circle(${t * radius}px at ${x}px ${y}px);`
		};
	}

	function wipeOut(_node: Element, { duration = 300 }: { duration?: number }) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%);`
		};
	}

	// white edge that rides the clip-path: a growing ring in, a sweeping line out
	function edgeIn(
		_node: Element,
		{ x, y, duration = 350 }: { x: number; y: number; duration?: number }
	) {
		const radius = radiusFrom(x, y);

		return {
			duration,
			easing: cubicIn,
			css: (t: number) =>
				`opacity: 1; left: ${x}px; top: ${y}px; width: ${t * radius * 2}px; height: ${t * radius * 2}px; border-radius: 50%; transform: translate(-50%, -50%);`
		};
	}

	function edgeOut(_node: Element, { duration = 300 }: { duration?: number }) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`opacity: 1; left: ${(1 - t) * 100}%; top: 50%; width: 0; height: 100vh; border-radius: 0; transform: translate(-1px, -50%);`
		};
	}

	// Retain successful work when a callback/navigation fails, so retry never
	// submits the mutation twice. Remote refresh failures provide their own retry.
	let completed = $state<ApiResponse | null>(null);
	let retryAction = $state<(() => Promise<ApiResponse>) | undefined>();

	async function execute() {
		if (isBusy || disabled) return;
		isBusy = true;
		isError = false;
		shown = '...this may take a moment...';

		try {
			const result = completed ?? (await (retryAction ?? action)());
			completed = result;
			retryAction = undefined;
			if (!result.success) throw new Error(result.message || 'action failed');
			if (navigate && !result.subject)
				throw new Error(
					'The action response did not include a navigation subject.'
				);
			await onsuccess?.(result);
			if (navigate) await goto(navigationHref(result.subject!));
			close();
		} catch (error) {
			if (
				error instanceof Error &&
				'retry' in error &&
				typeof error.retry === 'function'
			) {
				retryAction = error.retry as () => Promise<ApiResponse>;
			}
			shown = error instanceof Error ? error.message : 'action failed';
			isError = true;
			isBusy = false;
			isExpanded = true;
		}
	}
</script>

{#snippet trigger()}
	<button
		bind:this={triggerButton}
		class={disabled ? 'grey' : confirm ? 'pink' : 'blue'}
		class:green={!disabled && !confirm && tone === 'green'}
		class:orange={!disabled && !confirm && tone === 'orange'}
		aria-label={label ?? name}
		aria-busy={isBusy}
		disabled={disabled || isBusy || isExpanded}
		onclick={start}
	>
		{#if !confirm || !arrow || showLabel}<p>{name}</p>{/if}
		{#if confirm}
			<svg
				class="action-arrow"
				aria-hidden="true"
				viewBox="0 0 24 24"
				width="1rem"
				height="1rem"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M5 12h14M13 5l7 7-7 7" />
			</svg>
		{/if}
	</button>
{/snippet}

{#if inline}
	{@render trigger()}
{:else}
	<div class="row right action-row">
		{@render children?.()}
		{@render trigger()}
	</div>
{/if}

{#if isExpanded}
	<div
		class="edge"
		aria-hidden="true"
		in:edgeIn={{ x: originX, y: originY, duration: 400 }}
		out:edgeOut={{ duration: 300 }}
	></div>
	<div
		class="expanded"
		role="dialog"
		aria-modal="true"
		aria-label={isError ? 'Action error' : 'Confirm action'}
		tabindex="-1"
		in:wipeIn={{ x: originX, y: originY, duration: 400 }}
		out:wipeOut={{ duration: 300 }}
	>
		<div class="confirmation">
			<div class="row center">
				<p><strong>{shown}</strong></p>
			</div>
		</div>

		{#if isError}
			<div class="row center">
				{#if retryAction || completed}
					<button
						class={confirm ? 'pink' : 'blue'}
						aria-label="retry"
						{disabled}
						onclick={execute}
					>
						<p>retry</p>
					</button>
				{/if}
				<button class="blue" aria-label="okay" onclick={close}>
					<p>okay</p>
				</button>
			</div>
		{:else if !isBusy}
			<div class="row center">
				<button class="pink" aria-label={name} {disabled} onclick={execute}>
					<p>yes, go ahead</p>
				</button>
				<button class="blue" aria-label="cancel" onclick={close}>
					<p>cancel</p>
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.edge {
		position: fixed;
		box-sizing: border-box;
		border: solid 2px white;
		opacity: 0;
		pointer-events: none;
		z-index: 11;
	}
	.expanded {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		background: var(--brand-foreground, #ff1493);
		color: white;
		z-index: 10;
		overflow: hidden;
	}

	.confirmation {
		border-bottom: solid 2px white;
		padding: 0.5rem;
		margin: 1rem 0;
		margin-top: 50%;
	}

</style>
