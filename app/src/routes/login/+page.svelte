<script lang="ts">
	import { PUBLIC_URL } from '#lib/config.ts';
	import UserLogin from '#lib/components/userLogin.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import { local } from '#lib/stores/local.ts';
	import { hrefOf, imageOf } from '#lib/stores/guids.ts';

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
		<RouteLink
			href={`${hrefOf($local.caller_id ?? '')}/edit`}
			image={imageOf($local.caller_id ?? '')}
			title="Profile"
			description="edit your profile"
			isWhite={true}
		/>
	{:else if isInstalled}
		<UserLogin />
		<RouteLink 
		href="/browse"
		title="Guest"
		description="browse the app as a guest"
	/>	
	{:else}
		<InstallApp />
		<RouteLink 
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
