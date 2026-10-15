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

	function wipeIn(_node: Element, { x, y, duration = 350 }: { x: number; y: number; duration?: number }) {
		const maxX = Math.max(x, window.innerWidth - x);
		const maxY = Math.max(y, window.innerHeight - y);
		const radius = Math.sqrt(maxX * maxX + maxY * maxY);

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

<div class="row right">
	<button class={disabled ? 'grey' : 'pink'} aria-label={name} {disabled} onclick={start}>
		<p>{name}</p>
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 12h14M13 5l7 7-7 7" />
		</svg>
	</button>
</div>

{#if isExpanded}
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
		border-top: solid 2px white;
		border-bottom: solid 2px white;
		padding: 0.5rem;
		margin: 1rem 0;
		margin-top: 50%;
	}
</style>
