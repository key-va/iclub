<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { updateLadder, deleteLadder } from '#lib/stores/remote.ts';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { guids, entityOf, imageOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf(ladderId));

	let name = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Seed the form once the ladder has loaded, and again if the stored name changes
	$effect(() => {
		name = ladder?.name ?? '';
	});

	const nameChanged = $derived(
		name.trim() !== '' && name.trim() !== ladder?.name
	);
	const changed = $derived(Boolean(ladder) && (image !== '' || nameChanged));

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(image !== '' ? { image } : {})
	});

	const changes = $derived(
		Object.keys(updateData).map((key) =>
			key === 'image' ? 'ladder image' : 'ladder name'
		)
	);

	const updateMessage = $derived(`update the ${changes.join(' and ')}?`);

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
		image = '';
		if (fileInput) fileInput.value = '';
	}

	onMount(() => {
		if (!$local.caller_id || !$local.device_id)
			goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if ladder}
		<EntityHeader
			entity={ladder}
			image={image || imageOf(ladder.rk)}
		/>

		<div class="row right">
			<input
				type="text"
				placeholder="ladder name"
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
				aria-label="ladder image"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}

		<SummaryHelp>
			{#snippet help()}<HelpText topic="feature.ladder.edit" />{/snippet}
			{#snippet actions()}
				<ActionConfirmation
					inline
					name="update"
					message={updateMessage}
					action={() => updateLadder(ladderId, updateData)}
					disabled={!changed}
					onsuccess={clearForm}
				/>
			{/snippet}
		</SummaryHelp>

		<HiddenOptions inline title="More Options">
			<ActionConfirmation
				inline
				name="delete"
				message={`delete ${ladder.name}? this cannot be undone`}
				action={() => deleteLadder(ladderId)}
			/>
		</HiddenOptions>
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />edit
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
