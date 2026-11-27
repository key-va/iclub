<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import UserLogin from '#lib/components/userLogin.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import { local } from '#lib/stores/local.ts';
	import { hrefOf, imageOf } from '#lib/stores/guids.ts';

	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="login" image={$branding.icon} />
	<SummaryHelp summary="sign in">
		{#snippet help()}<HelpText topic="feature.login" />{/snippet}
	</SummaryHelp>

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
