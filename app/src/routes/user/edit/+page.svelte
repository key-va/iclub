<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local, clear_local_data } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';

	const userId = $derived($local.caller_id ?? '');
	const user = $derived(entityOf($guids.items, userId));

	let name = $state('');

	// Seed the form once the user has loaded, and again if the stored name changes
	$effect(() => {
		name = user?.name ?? '';
	});

	const changed = $derived(Boolean(user) && name.trim() !== '' && name.trim() !== user?.name);

	function logout() {
		clear_local_data();
		goto('/');
	}

	onMount(() => {
		if (!$local.caller_id || !$local.device_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if user}
		<div class="row right">
			<p class="truncate"><strong>{user.name}</strong><br />edit</p>
			<div class="round-icon-small" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
		</div>

		<div class="row right">
			<input type="text" placeholder="name" autocomplete="name" bind:value={name} />
		</div>

		<ApiService
			name="update"
			message="update your name to {name.trim()}?"
			endpoint={`user/${userId}/update`}
			data={{ name: name.trim() }}
			disabled={!changed}
		/>

		<div class="row right">
			<button class="blue" aria-label="log out" onclick={logout}><p>log out</p></button>
		</div>

		<ApiService
			name="delete account"
			message="delete your account? this cannot be undone"
			endpoint={`user/${userId}/delete`}
			onsuccess={logout}
		/>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />edit</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
