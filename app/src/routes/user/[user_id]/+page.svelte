<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { goto } from '$app/navigation';
	import { local, clear_local_data } from '#lib/stores/local.ts';
	import UserUpdate from '#lib/components/userUpdate.svelte';
	import ApiService from '#lib/components/apiService.svelte';

	const userId = $derived(page.params.user_id ?? '');
	const user = $derived(entityOf($guids.items, userId));
	const isMe = $derived($local.caller_id === userId);

	function logout() {
		clear_local_data();
		goto('/');
	}
</script>

<div class="page">
	{#if user}
		<div class="row right">
			<p class="truncate"><strong>{user.name}</strong><br />user</p>
			<div class="round-icon-small" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
		</div>

		{#if isMe}
			<UserUpdate {user} />

			<div class="row right">
				<button class="blue" aria-label="log out" onclick={logout}><p>log out</p></button>
			</div>

			<ApiService
				name="delete account"
				message="delete your account? this cannot be undone"
				endpoint={`user/${userId}/delete`}
				onsuccess={logout}
			/>
		{/if}
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
