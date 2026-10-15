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
	let email = $state('');
	let phone = $state('');

	// Seed the form once the user has loaded, and again if the stored name changes
	$effect(() => {
		name = user?.name ?? '';
	});

	const cleanEmail = $derived(email.trim());
	// Phone is stored as digits only, including country code (e.g. 61412345678)
	const cleanPhone = $derived(phone.replace(/[\s\-().+]/g, ''));

	const nameChanged = $derived(name.trim() !== '' && name.trim() !== user?.name);
	const emailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail));
	const phoneValid = $derived(/^\d{8,15}$/.test(cleanPhone));
	const emailError = $derived(cleanEmail !== '' && !emailValid);
	const phoneError = $derived(cleanPhone !== '' && !phoneValid);

	const changed = $derived(
		Boolean(user) &&
			!emailError &&
			!phoneError &&
			(nameChanged || (cleanEmail !== '' && emailValid) || (cleanPhone !== '' && phoneValid))
	);

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(cleanEmail !== '' && emailValid ? { email: cleanEmail } : {}),
		...(cleanPhone !== '' && phoneValid ? { phone: cleanPhone } : {})
	});

	const updateMessage = $derived(
		`update your ${Object.keys(updateData).join(', ').replace(/, ([^,]*)$/, ' and $1')}?`
	);

	function clearForm() {
		email = '';
		phone = '';
	}

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

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
			
		</div>

		<div class="row right">
			<input type="text" placeholder="name" autocomplete="name" bind:value={name} />
		</div>

		<div class="row center">
			<p>Your email and phone number is <strong>not</strong> shown here, but entering them will update the information on file</p>
		</div>

		<div class="row right">
			<input type="email" inputmode="email" placeholder="new email" autocomplete="off" autocapitalize="none" bind:value={email} />
		</div>
		{#if emailError}
			<div class="row right"><p class="error">enter a valid email address</p></div>
		{/if}

		<div class="row right">
			<input type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="new phone (61XXXXXXXXX)" autocomplete="off" bind:value={phone} />
		</div>
		{#if phoneError}
			<div class="row right"><p class="error">phone must be 8 to 15 digits including country code</p></div>
		{/if}

		<ApiService
			name="update"
			message={updateMessage}
			endpoint={`user/${userId}/update`}
			data={updateData}
			disabled={!changed}
			onsuccess={clearForm}
		/>

		<div class="row right">
			<button class="blue" aria-label="log out" onclick={logout}><p>log out</p></button>
			<ApiService
				inline
				name="delete account"
				message="delete your account? this cannot be undone"
				endpoint={`user/${userId}/delete`}
				onsuccess={logout}
			/>
		</div>
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
