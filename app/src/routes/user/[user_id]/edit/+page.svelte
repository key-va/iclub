<script lang="ts">
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { updateUser, deleteUser } from '#lib/stores/remote.ts';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { clearSession } from '#lib/stores/auth.ts';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { guids, entityOf, imageOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const userId = $derived($local.caller_id ?? '');
	const user = $derived(entityOf(userId));

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Seed the form once the user has loaded, and again if the stored name changes
	$effect(() => {
		name = user?.name ?? '';
	});

	const cleanEmail = $derived(email.trim());
	// Phone is stored as digits only, including country code (e.g. 61412345678)
	const cleanPhone = $derived(phone.replace(/[\s\-().+]/g, ''));

	const nameChanged = $derived(
		name.trim() !== '' && name.trim() !== user?.name
	);
	const emailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail));
	const phoneValid = $derived(/^\d{8,15}$/.test(cleanPhone));
	const emailError = $derived(cleanEmail !== '' && !emailValid);
	const phoneError = $derived(cleanPhone !== '' && !phoneValid);

	const changed = $derived(
		Boolean(user) &&
			!emailError &&
			!phoneError &&
			(image !== '' ||
				nameChanged ||
				(cleanEmail !== '' && emailValid) ||
				(cleanPhone !== '' && phoneValid))
	);

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(cleanEmail !== '' && emailValid ? { email: cleanEmail } : {}),
		...(cleanPhone !== '' && phoneValid ? { phone: cleanPhone } : {}),
		...(image !== '' ? { image } : {})
	});

	const changes = $derived(
		Object.keys(updateData).map((key) =>
			key === 'image' ? 'profile image' : key
		)
	);

	const updateMessage = $derived(
		`update your ${changes.join(', ').replace(/, ([^,]*)$/, ' and $1')}?`
	);

	// Centre-crop to a square and shrink to a small JPEG so the upload stays well under the API limit
	async function pickImage() {
		const file = fileInput?.files?.[0];

		imageError = '';
		image = '';

		if (!file) return;

		try {
			image = await prepareSquareImage(file);
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

	async function logout() {
		await clearSession();
		await goto('/login');
	}

	onMount(() => {
		if (!$local.caller_id || !$local.device_id)
			goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if user}
		<EntityHeader
			entity={user}
			image={image || imageOf(user.rk)}
		/>
		<SummaryHelp summary="profile details">
			{#snippet help()}<p class="info">Profile image updates may take some time to show. Your email and phone number are used for login and account validation and are never shown in the app.</p>{/snippet}
			{#snippet actions()}
				<ActionConfirmation
					inline
					name="update"
					message={updateMessage}
					action={() => updateUser(userId, updateData)}
					disabled={!changed}
					onsuccess={clearForm}
				/>
			{/snippet}
		</SummaryHelp>

		<div class="group">
			<div class="row right">
				<input
					type="text"
					placeholder="name"
					autocomplete="name"
					bind:value={name}
				/>
				<button
					class="blue"
					aria-label="image"
					onclick={() => fileInput?.click()}
				>
					<svg
						viewBox="0 0 24 24"
						width="1rem"
						height="1rem"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						role="img"
						aria-label="Camera"
					>
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


			<div class="row right">
				<input
					type="email"
					inputmode="email"
					placeholder="email@example.com"
					autocomplete="off"
					autocapitalize="none"
					bind:value={email}
				/>
			</div>
			{#if emailError}
				<div class="row right">
					<p class="error">enter a valid email address</p>
				</div>
			{/if}

			<div class="row right">
				<input
					type="tel"
					inputmode="numeric"
					pattern="[0-9]*"
					placeholder="61XXXXXXXXX"
					autocomplete="off"
					bind:value={phone}
				/>
			</div>
			{#if phoneError}
				<div class="row right">
					<p class="error">
						phone must be 8 to 15 digits including country code
					</p>
				</div>
			{/if}
		</div>


		<HiddenOptions inline title="More Options">
			<button class="blue" aria-label="logout" onclick={logout}>
				<p>logout</p>
			</button>
			<ActionConfirmation
				inline
				name="delete"
				message="delete your account? this cannot be undone"
				action={() => deleteUser(userId)}
				onsuccess={clearSession}
			/>
		</HiddenOptions>
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />edit
			</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row right">
			<button class="blue" aria-label="logout" onclick={logout}>
				<p>reset</p>
			</button>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
