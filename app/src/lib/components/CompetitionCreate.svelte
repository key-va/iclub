<script lang="ts">
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import { createCompetition, createGroup } from '#lib/stores/remote.ts';

	import { branding } from '#lib/stores/branding.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';

	let { type }: { type: 'group' | 'comp' } = $props();
	const isCompetition = $derived(type === 'comp');
	let competitionType = $state('elimination');
	const title = $derived(isCompetition ? 'Competition' : 'Group');

	let name = $state(page.url.searchParams.get('name') ?? '');
	let image = $state('');
	let imageError = $state('');
	let showHelp = $state(false);
	let fileInput = $state<HTMLInputElement>();

	const cleanName = $derived(name.trim());

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

	const createData = $derived({
		name: cleanName,
		...(image ? { image } : {}),
		...(isCompetition ? { competition_type: competitionType } : {})
	});

	onMount(() => {
		if (!$local.caller_id || !$local.device_id)
			goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	<EntityHeader
		{title}
		subtitle="create"
		image={image || $branding.icon}
	/>

	{#if !$branding.clubId}<p class="info">
			Open your club website to create a {isCompetition ? 'competition' : 'group'}.
		</p>{/if}
	<div class="group">
		<div class="row right">
			<input
				type="text"
				placeholder="{title.toLowerCase()} name"
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
				aria-label="{title.toLowerCase()} image"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}

		{#if isCompetition}
			<div class="row right">
				<select aria-label="Competition type" bind:value={competitionType}>
					<option value="elimination">Elimination</option>
				</select>
			</div>
		{/if}
		{#if showHelp}
			<div class="row left">
				<p class="info">{#if isCompetition}Create a singles knockout competition using super set scoring.{:else}<strong>group</strong>: create a group to facilitate a chat space to arrange social hits and activities{/if}</p>
			</div>
		{/if}
	</div>

	<ActionConfirmation
		name="create"
		message={`create the ${title.toLowerCase()} ${cleanName}?`}
		action={() => (isCompetition ? createCompetition : createGroup)(createData)}
		disabled={cleanName === '' || !$branding.clubId}
	>
		<button
			class="blue"
			aria-label="help"
			aria-pressed={showHelp}
			onclick={() => (showHelp = !showHelp)}
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
				aria-label="Help"
			>
				<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
				<path d="M12 18h.01" />
			</svg>
		</button>
	</ActionConfirmation>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
