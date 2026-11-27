<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { updateComp, updateGroup } from '#lib/stores/remote.ts';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		guids,
		entityOf,
		imageOf,
		relationsOf,
		typeOf
	} from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	const { id, type }: { id: string; type: 'comp' | 'group' } = $props();
	const entity = $derived(entityOf(id));
	const canEdit = $derived(entity?.pk === type && (type === 'group' || entity.state === 'pending'));

	const admin = $derived(
		relationsOf(id)
			.filter((row) => typeOf(row.rk) === 'user' && entityOf(row.rk))
			.some((user) => user.rk === $local.caller_id && user.is_admin === true)
	);

	let name = $state('');
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Seed the form once the entity has loaded, and again if the stored name changes
	$effect(() => {
		name = entity?.name ?? '';
	});

	const nameChanged = $derived(
		name.trim() !== '' && name.trim() !== entity?.name
	);
	const changed = $derived(Boolean(entity) && (image !== '' || nameChanged));

	const updateData = $derived({
		...(nameChanged ? { name: name.trim() } : {}),
		...(image !== '' ? { image } : {})
	});

	const changes = $derived(
		Object.keys(updateData).map((key) =>
			key === 'image' ? `${type} image` : `${type} name`
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
	{#if entity && canEdit && admin}
		<EntityHeader
			{entity}
			image={image || imageOf(entity.rk)}
		/>
		<SummaryHelp summary="name and image">
			{#snippet help()}<HelpText topic={`feature.${type}.edit`} />{/snippet}
			{#snippet actions()}
				<ActionConfirmation
					inline
					name="update"
					message={updateMessage}
					action={() => (type === 'comp' ? updateComp : updateGroup)(id, updateData)}
					disabled={!changed}
					onsuccess={clearForm}
				/>
			{/snippet}
		</SummaryHelp>

		<div class="row right">
			<input
				type="text"
				placeholder={`${type} name`}
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
				aria-label={`${type} image`}
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
				Only the <strong>{type} name</strong> and <strong>image</strong> can be modified
				after creation
			</p>
		</div>

	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>
					{$guids.loaded
						? entity
							? !canEdit
								? 'This comp can be edited while awaiting club approval'
								: `Only a ${type} admin can edit this ${type}`
							: 'Not found'
						: 'Loading'}
				</strong><br />edit
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
