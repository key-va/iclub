<script lang="ts">
	import InstallApp from '#lib/components/installApp.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf, relatedEntities } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';

	const groupId = $derived(page.params.group_id ?? '');
	const group = $derived(entityOf($guids.items, groupId));

	const admin = $derived(
		relatedEntities($guids.items, groupId, 'user').some(
			(user) => user.rk === $local.caller_id && user.relation.is_admin === true,
		),
	);

	let name = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Seed the form once the group has loaded, and again if the stored name changes
	$effect(() => {
		name = group?.name ?? '';
	});

	const nameChanged = $derived(
		name.trim() !== '' && name.trim() !== group?.name,
	);
	const changed = $derived(Boolean(group) && (image !== '' || nameChanged));

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(image !== '' ? { image } : {}),
	});

	const changes = $derived(
		Object.keys(updateData).map((key) =>
			key === 'image' ? 'group image' : 'group name',
		),
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

	function clearForm() {
		image = '';
		if (fileInput) fileInput.value = '';
	}

	onMount(() => {
		if (!$local.caller_id || !$local.device_id)
			goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if group && admin}
		<div class="row right">
			<p class="truncate"><strong>{group.name}</strong><br />edit</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div
				class="round-icon-big"
				style="background-image: url('{image ||
					`${PUBLIC_URL}/${group.rk}.jpg`}');"
			></div>
		</div>
		<InstallApp />

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

		<div class="row center">
			<p>
				Only the <strong>group name</strong> and <strong>image</strong> can be modified
				after creation
			</p>
		</div>

		<ApiService
			name="update"
			message={updateMessage}
			endpoint={`group/${groupId}/update`}
			data={updateData}
			disabled={!changed}
			onsuccess={clearForm}
		/>
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong
					>{$guids.loaded
						? group
							? 'Only a group admin can edit this group'
							: 'Not found'
						: 'Loading'}</strong
				><br />edit
			</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
