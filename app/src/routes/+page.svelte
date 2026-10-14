<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';
	import UserLogin from '#lib/components/userLogin.svelte';

	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));

	// Logging in is optional, but a logged in user's home is their own page
	onMount(() => {
		if (isLoggedIn) goto(`/user/${$local.caller_id}`, { replaceState: true });
	});
</script>

<div class="row right">
	<p class="truncate"><strong>Coming Soon</strong><br />under development</p>
	<div class="blank-icon-small"></div>
</div>

<div class="splash">
	<img src="/favicons/icon-512.png" alt="Intra Club" />
</div>

{#if !isLoggedIn}
	<div class="login-area">
		<UserLogin />
	</div>
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 0;
	}

	.splash img {
		width: min(50vw, 16rem);
		height: auto;
	}

	.login-area {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 5rem;
		z-index: 1;
	}
</style>
