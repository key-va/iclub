<script lang="ts">
	import { goto } from '$app/navigation';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { callApi, type ApiResponse } from '#lib/stores/remote.ts';
	import { guids } from '#lib/stores/guids.ts';

	interface Props {
		name?: string;
		message?: string;
		endpoint: string;
		data?: Record<string, unknown>;
		signed?: boolean;
		// false skips the confirmation overlay and runs immediately
		confirm?: boolean;
		disabled?: boolean;
		// true renders just the button so it can sit inside a caller's own row
		inline?: boolean;
		onsuccess?: (result: ApiResponse) => void | Promise<void>;
	}

	let {
		name = 'do action',
		message = 'are you sure?',
		endpoint,
		data = {},
		signed = true,
		confirm = true,
		disabled = false,
		inline = false,
		onsuccess
	}: Props = $props();

	let isExpanded = $state(false);
	let isBusy = $state(false);
	let isError = $state(false);
	let shown = $state('');

	let originX = $state(0);
	let originY = $state(0);

	function start(event: MouseEvent) {
		originX = event.clientX;
		originY = event.clientY;
		shown = message;
		isError = false;
		isExpanded = true;

		if (!confirm) execute();
	}

	function close() {
		isExpanded = false;
		isBusy = false;
		isError = false;
	}

	function radiusFrom(x: number, y: number) {
		return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
	}

	function wipeIn(_node: Element, { x, y, duration = 350 }: { x: number; y: number; duration?: number }) {
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
	function edgeIn(_node: Element, { x, y, duration = 350 }: { x: number; y: number; duration?: number }) {
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

	async function execute() {
		isBusy = true;
		isError = false;
		shown = '...this may take a moment...';

		let result: ApiResponse;

		try {
			result = await callApi(endpoint, data, signed);
		} catch (e) {
			shown = e instanceof Error ? e.message : 'action failed';
			isError = true;
			isBusy = false;
			return;
		}

		try {
			shown = '...checking updates...';
			await guids.refresh();
			await onsuccess?.(result);

			if (result.subject) await goto(`/${result.subject.split('_')[0]}/${result.subject}`);
		} catch (e) {
			// The action succeeded but the fresh data could not be loaded; allow a retry of the refresh only
			shown = `${result.message} (could not refresh: ${e instanceof Error ? e.message : 'unknown error'})`;
			isError = true;
			isBusy = false;
			return;
		}

		close();
	}
</script>

{#snippet trigger()}
	<button class={disabled ? 'grey' : 'pink'} aria-label={name} {disabled} onclick={start}>
		<p>{name}</p>
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 12h14M13 5l7 7-7 7" />
		</svg>
	</button>
{/snippet}

{#if inline}
	{@render trigger()}
{:else}
	<div class="row right">
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
	<div class="expanded" in:wipeIn={{ x: originX, y: originY, duration: 400 }} out:wipeOut={{ duration: 300 }}>
		<div class="confirmation">
			<div class="row center">
				<p><strong>{shown}</strong></p>
			</div>
		</div>

		{#if isError}
			<div class="row center">
				<button class="blue" aria-label="okay" onclick={close}><p>okay</p></button>
			</div>
		{:else if !isBusy}
			<div class="row center">
				<button class="pink" aria-label={name} onclick={execute}><p>yes, go ahead</p></button>
				<button class="blue" aria-label="cancel" onclick={close}><p>cancel</p></button>
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
		background: deeppink;
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
