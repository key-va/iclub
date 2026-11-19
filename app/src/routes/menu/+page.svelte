<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { hrefOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="menu" image={$branding.icon} />

	{#if caller_id && device_id}
		<RouteLink
			href="/browse"
			title="Browse"
			description="ladders, teams, groups and elims"
			isWhite={true}
		/>
		<RouteLink
			href="{hrefOf(caller_id)}/edit"
			title="Profile"
			description="edit your profile"
			isWhite={false}
		/>
	{:else}
		<RouteLink
			href="/login"
			title="Login"
			description="login or create account"
			isWhite={true}
		/>
		<RouteLink
			href="/browse"
			title="Browse"
			description="ladders, teams, groups and elims"
			isWhite={false}
		/>
	{/if}

	<RouteLink
		href="/about"
		title="About"
		description="help and about"
		isWhite={false}
	/>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
