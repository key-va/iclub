<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import GencRouteLink from '#lib/components/gencRouteLink.svelte';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />menu</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
	</div>

	{#if caller_id && device_id}

		<GencRouteLink href="/user/{caller_id}/edit" title="Profile" description="edit your profile" isWhite={true} />

		<GencRouteLink href="/admin" title="Admin" description="create and manage ladders" isWhite={false} />

	{:else}

		<GencRouteLink href="/login" title="Login" description="login or create account" isWhite={true} />

	{/if}

	<GencRouteLink href="/browse" title="Browse" description="ladders, events and teams" isWhite={false} />
	<GencRouteLink href="/about" title="About" description="help and about" isWhite={false} />

</div>

<style>
	.page {
		width: 100%;
	}
</style>
