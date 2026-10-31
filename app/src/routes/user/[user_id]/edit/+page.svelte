<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local, clear_local_data } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';

	const userId = $derived($local.caller_id ?? '');
	const user = $derived(entityOf($guids.items, userId));

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();
	let showHelp = $state(false);

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
			(image !== '' || nameChanged || (cleanEmail !== '' && emailValid) || (cleanPhone !== '' && phoneValid))
	);

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(cleanEmail !== '' && emailValid ? { email: cleanEmail } : {}),
		...(cleanPhone !== '' && phoneValid ? { phone: cleanPhone } : {}),
		...(image !== '' ? { image } : {})
	});

	const changes = $derived(
		Object.keys(updateData).map((key) => (key === 'image' ? 'profile image' : key))
	);

	const updateMessage = $derived(`update your ${changes.join(', ').replace(/, ([^,]*)$/, ' and $1')}?`);

	// Centre-crop to a square and shrink to a small JPEG so the upload stays well under the API limit
	async function pickImage() {
		const file = fileInput?.files?.[0];

		imageError = '';
		image = '';

		if (!file) return;

		try {
			const bitmap = await createImageBitmap(file);
			const size = Math.min(512, bitmap.width, bitmap.height);
			const side = Math.min(bitmap.width, bitmap.height);
			const canvas = document.createElement('canvas');

			canvas.width = size;
			canvas.height = size;

			canvas
				.getContext('2d')!
				.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);

			bitmap.close();
			image = canvas.toDataURL('image/jpeg', 0.85);
		} catch {
			imageError = 'that file could not be read as an image';
		}
	}

	function clearForm() {
		email = '';
		phone = '';
		image = '';
		if (fileInput) fileInput.value = '';
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
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div
				class="round-icon-big"
				style="background-image: url('{image || `${PUBLIC_URL}/${user.rk}.jpg`}');"
			></div>
		</div>

		<div class="row right">
			<input type="text" placeholder="name" autocomplete="name" bind:value={name} />
			<button class="blue" aria-label="image" onclick={() => fileInput?.click()}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Camera">
					<path d="M2.5 7h4l1.5-3h8l1.5 3h4v13h-19z" />
					<circle cx="12" cy="13.5" r="4" />
				</svg>
			</button>
			<input
				type="file"
				accept="image/*"
				aria-label="profile image"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}

		{#if showHelp}
			<div class="row left white help">
				<p>Updates to your <strong>profile image</strong> may take some time to show</p>
			</div>
		{/if}

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
		{#if showHelp}
			<div class="row left white help">
				<p>Your email and phone number is <strong>not</strong> shown here, but entering them will update the information on file</p>
			</div>
		{/if}

		<ApiService
			name="update"
			message={updateMessage}
			endpoint={`user/${userId}/update`}
			data={updateData}
			disabled={!changed}
			onsuccess={clearForm}
		>
			<button class="blue" aria-label="help" aria-pressed={showHelp} onclick={() => (showHelp = !showHelp)}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Help">
					<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
					<path d="M12 18h.01" />
				</svg>
			</button>
		</ApiService>

		<RouteLink hasMoreOptions title="More" description="logout or delete account">
			<button class="blue" aria-label="logout" onclick={logout}><p>logout</p></button>
			<ApiService
				inline
				name="delete"
				message="delete your account? this cannot be undone"
				endpoint={`user/${userId}/delete`}
				onsuccess={logout}
			/>
		</RouteLink>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />edit</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row right">
			<button class="blue" aria-label="logout" onclick={logout}><p>reset</p></button>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
	.help p {
		padding: 1em 2em;
	}
</style>
