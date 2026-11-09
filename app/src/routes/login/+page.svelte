<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import UserLogin from '#lib/components/userLogin.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import { local } from '#lib/stores/local.ts';
	import { hrefOf, imageOf } from '#lib/stores/guids.ts';

	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>{$branding.name}</strong><br />login</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('{$branding.icon}');"></div>
	</div>
	<InstallApp />

	{#if isLoggedIn}
		<RouteLink
			href={`${hrefOf($local.caller_id ?? '')}/edit`}
			image={imageOf($local.caller_id ?? '')}
			title="Profile"
			description="edit your profile"
			isWhite={true}
		/>
	{:else}
		<UserLogin />
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
