<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import GencRoutLink from '#lib/components/gencRoutLink.svelte';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />menu</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/splash-512.png');"></div>
	</div>

	{#if caller_id && device_id}

		<GencRoutLink href="/user/{caller_id}/edit" title="Profile" description="edit your profile" white={true} />

	{:else}

		<GencRoutLink href="/login" title="Login" description="login or create account" white={true} />

	{/if}

	<GencRoutLink href="/browse" title="Browse" description="ladders, events and teams" white={false} />
	<GencRoutLink href="/about" title="About" description="help and about" white={false} />

</div>

<style>
	.page {
		width: 100%;
	}
</style>
