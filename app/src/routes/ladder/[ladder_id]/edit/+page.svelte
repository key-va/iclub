<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import GencRouteLink from '#lib/components/gencRouteLink.svelte';

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));

	let name = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Seed the form once the ladder has loaded, and again if the stored name changes
	$effect(() => {
		name = ladder?.name ?? '';
	});

	const nameChanged = $derived(name.trim() !== '' && name.trim() !== ladder?.name);
	const changed = $derived(Boolean(ladder) && (image !== '' || nameChanged));

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(image !== '' ? { image } : {})
	});

	const changes = $derived(
		Object.keys(updateData).map((key) => (key === 'image' ? 'ladder image' : 'ladder name'))
	);

	const updateMessage = $derived(`update the ${changes.join(' and ')}?`);

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
		image = '';
		if (fileInput) fileInput.value = '';
	}

	onMount(() => {
		if (!$local.caller_id || !$local.device_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if ladder}
		<div class="row right">
			<p class="truncate"><strong>{ladder.name}</strong><br />edit</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div
				class="round-icon-big"
				style="background-image: url('{image || `${PUBLIC_URL}/${ladder.rk}.jpg`}');"
			></div>
		</div>

		<div class="row right">
			<input type="text" placeholder="ladder name" autocomplete="off" bind:value={name} />
			<button class="blue" aria-label="image" onclick={() => fileInput?.click()}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Camera">
					<path d="M2.5 7h4l1.5-3h8l1.5 3h4v13h-19z" />
					<circle cx="12" cy="13.5" r="4" />
				</svg>
			</button>
			<input
				type="file"
				accept="image/*"
				aria-label="ladder image"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}

		<div class="row center">
			<p>Only the <strong>ladder name</strong> and <strong>image</strong> can be modified after creation</p>
		</div>

		<ApiService
			name="update"
			message={updateMessage}
			endpoint={`ladder/${ladderId}/update`}
			data={updateData}
			disabled={!changed}
			onsuccess={clearForm}
		/>

		<GencRouteLink hasMoreOptions title="More" description="delete ladder">
			<ApiService
				inline
				name="delete"
				message="delete this ladder? this cannot be undone"
				endpoint={`ladder/${ladderId}/delete`}
				onsuccess={() => goto('/admin')}
			/>
		</GencRouteLink>
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
