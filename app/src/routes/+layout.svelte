<script lang="ts">
	import '#lib/style.css';
	import { onMount } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { APP_VERSION, PUBLIC_URL } from '#lib/config.ts';
	import { guids, nameOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { startPush } from '#lib/stores/push.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const callerId = $derived($local.caller_id);
	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));
	const homeHref = $derived(isLoggedIn && callerId ? `/user/${callerId}` : '/login');

	let originX = innerWidth;
	let originY = innerHeight;

	// forward navigations wipe out from the tap; back navigations (popstate) wipe back into it
	onNavigate((navigation) => {
		if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const root = document.documentElement;
		const maxX = Math.max(originX, innerWidth - originX);
		const maxY = Math.max(originY, innerHeight - originY);

		root.style.setProperty('--wipe-x', `${originX}px`);
		root.style.setProperty('--wipe-y', `${originY}px`);
		root.style.setProperty('--wipe-r', `${Math.hypot(maxX, maxY)}px`);
		root.dataset.nav = navigation.type === 'popstate' ? 'back' : 'forward';

		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});

			transition.finished.finally(() => delete root.dataset.nav);
		});
	});

	onMount(() => {
		const track = (e: PointerEvent) => {
			originX = e.clientX;
			originY = e.clientY;
		};
		addEventListener('pointerdown', track, true);

		// load the guids snapshot once on startup, then keep it fresh
		guids.load().catch((err) => console.error('[guids] initial load failed', err));
		guids.startAutoRefresh(90000);

		const stopPush = startPush();

		return () => {
			removeEventListener('pointerdown', track, true);
			guids.stopAutoRefresh();
			stopPush();
		};
	});

	function back() {
		if (history.length > 1) history.back();
		else goto('/');
	}
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#00bfff" />

	<link rel="apple-touch-icon" sizes="180x180" href="/favicons/favicon-180.png" />
	<link rel="icon" href="/favicons/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16.png" />
</svelte:head>

<div class="wipe-edge" aria-hidden="true"></div>

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
			<a class="button" href={homeHref} aria-label="home">
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
