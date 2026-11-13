<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import InstallApp from '#lib/components/installApp.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';

	let name = $state(page.url.searchParams.get('name') ?? '');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	const cleanName = $derived(name.trim());

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
				.drawImage(
					bitmap,
					(bitmap.width - side) / 2,
					(bitmap.height - side) / 2,
					side,
					side,
					0,
					0,
					size,
					size,
				);

			bitmap.close();
			image = canvas.toDataURL('image/jpeg', 0.85);
		} catch {
			imageError = 'that file could not be read as an image';
		}
	}

	const createData = $derived({ name: cleanName, ...(image ? { image } : {}) });

	onMount(() => {
		if (!$local.caller_id || !$local.device_id)
			goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Group</strong><br />create</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div
			class="round-icon-big"
			style="background-image: url('{image || $branding.icon}');"
		></div>
	</div>
	<InstallApp />

	{#if !$branding.clubId}<p class="info">
			Open your club website to create a group.
		</p>{/if}
	<div class="group">
		<div class="row right">
			<input
				type="text"
				placeholder="group name"
				autocomplete="off"
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
				aria-label="group image"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}
	</div>

	<ApiService
		name="create"
		message={`create the group ${cleanName}?`}
		endpoint="group/create"
		data={createData}
		disabled={cleanName === '' || !$branding.clubId}
	/>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
