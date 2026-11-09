<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import InstallApp from '#lib/components/installApp.svelte';
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf, hrefOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>{$branding.name}</strong><br />menu</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('{$branding.icon}');"></div>
	</div>
	<InstallApp />

	{#if caller_id && device_id}

		<RouteLink href="/browse" title="Browse" description="ladders, events and teams" isWhite={true} />
		<RouteLink href="{hrefOf(caller_id)}/edit" title="Profile" description="edit your profile" isWhite={false} />

	{:else}

		<RouteLink href="/login" title="Login" description="login or create account" isWhite={true} />
		<RouteLink href="/browse" title="Browse" description="ladders, events and teams" isWhite={false} />

	{/if}
	
	<RouteLink href="/about" title="About" description="help and about" isWhite={false} />

</div>

<style>
	.page {
		width: 100%;
	}
</style>
