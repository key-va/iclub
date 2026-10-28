<script lang="ts">
	import { fly } from 'svelte/transition';
	import UserLogin from '#lib/components/userLogin.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	import GencRouteLink from '#lib/components/gencRouteLink.svelte';
	import { local } from '#lib/stores/local.ts';

	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));
	let isInstalled = $state(false);

	$effect(() => {
		isInstalled =
			window.matchMedia('(display-mode: standalone)').matches ||
			window.matchMedia('(display-mode: fullscreen)').matches ||
			window.matchMedia('(display-mode: minimal-ui)').matches ||
			(navigator as unknown as { standalone?: boolean }).standalone === true;
	});
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />login</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
	</div>

	{#if isLoggedIn}
		<GencRouteLink
			href={`/user/${$local.caller_id}`}
			title="Profile"
			description="edit your profile"
			isWhite={true}
		/>
	{:else if isInstalled}
		<UserLogin />
		<GencRouteLink 
		href="/browse"
		title="Guest"
		description="browse the app as a guest"
	/>	
	{:else}
		<InstallApp />
		<GencRouteLink 
		href="/browse"
		title="Guest"
		description="browse the app as a guest"
	/>	
	{/if}
	
</div>

<style>
	.page {
		width: 100%;
	}

</style>
