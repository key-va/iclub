<script lang="ts">
	import '#lib/style.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { APP_VERSION, PUBLIC_URL } from '#lib/config.ts';
	import { guids, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import OneSignal from '#lib/components/OneSignal.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const callerId = $derived($local.caller_id);
	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));

	onMount(() => {
		// load the guids snapshot once on startup, then keep it fresh
		guids.load().catch((err) => console.error('[guids] initial load failed', err));
		guids.startAutoRefresh(15000);

		return () => guids.stopAutoRefresh();
	});

	function back() {
		if (history.length > 1) history.back();
		else goto('/');
	}
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#00bfff" />

	<link rel="apple-touch-icon" sizes="180x180" href="/favicons/icon-180.png" />
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
</svelte:head>

<OneSignal />

<div class="fixed-top">
	<div class="row right">
		<a class="button" href="/menu" aria-label="menu">
			<button aria-label="menu">
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Menu">
					<line x1="4" y1="5" x2="20" y2="5" />
					<line x1="4" y1="12" x2="20" y2="12" />
					<line x1="4" y1="19" x2="20" y2="19" />
				</svg>
			</button>
		</a>
	</div>
</div>

<div class="slot">
	{@render children()}
</div>

<div class="footer">
	<div class="row left">
		<p class="truncate"><strong>Intra Club</strong><br />{APP_VERSION}</p>
	</div>
</div>

<div class="fixed-bottom">
	<div class="row right">
		<button aria-label="Go back" onclick={back}>
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Back">
				<path d="M19 12H5M11 5l-7 7 7 7" />
			</svg>
			<p>back</p>
		</button>
		<div class="right">
			<a class="button" href="/" aria-label="home">
				{#if isLoggedIn && callerId}
					<button
						style="background-image: url('{PUBLIC_URL}/{callerId}.jpg');"
						aria-label={nameOf($guids.items, callerId)}
					></button>
				{:else}
					<button aria-label="home">
						<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Home">
							<path d="M3 10L12 3l9 7" />
							<path d="M5 10v10h14V10z" />
						</svg>
					</button>
				{/if}
			</a>
		</div>
	</div>
</div>

<style>
	.footer {
		width: 100%;
		min-height: 5rem;
		display: flex;
		background: deepskyblue;
		color: #e6e6e6;
	}

	.fixed-top,
	.fixed-bottom {
		position: fixed;
		right: 0;
		display: flex;
		color: #e6e6e6;
		height: 5rem;
		z-index: 9;
	}

	.fixed-top {
		top: 0;
	}

	.fixed-bottom {
		bottom: 0;
	}
</style>
