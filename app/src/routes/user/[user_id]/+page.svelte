<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';

	const userId = $derived(page.params.user_id ?? '');
	const user = $derived(entityOf($guids.items, userId));
</script>

<div class="page">
	{#if user}
		<div class="row right">
			<p class="truncate"><strong>{user.name}</strong><br />user</p>
			<div class="round-icon-small" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
		</div>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />user</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
