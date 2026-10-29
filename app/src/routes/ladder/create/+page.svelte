<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import { ladderSettings } from '#lib/strings.ts';

	let name = $state(page.url.searchParams.get('name') ?? '');
	// Number fields start empty (showing the default as a placeholder) and fall back to the default on the API
	let values = $state<Record<string, string | number | null>>(
		Object.fromEntries(
			Object.entries(ladderSettings).map(([key, setting]) => [key, setting.type === 'enum' ? setting.default : null])
		)
	);
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();
	let infoKey = $state('');

	const cleanName = $derived(name.trim());

	// Empty number fields are fine: the API applies the default
	function numberOk(key: string) {
		const setting = ladderSettings[key];
		const value = values[key];

		if (setting.type !== 'number' || value === null) return true;

		return typeof value === 'number' && Number.isInteger(value) && value >= setting.min && value <= setting.max;
	}

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

	const numbersValid = $derived(Object.keys(ladderSettings).every(numberOk));

	// Intra Club is the only club for now; this becomes a user choice later
	const CLUB_ID = 'club_0000-00-00_00-00-00_bootstrap00c';

	const createData = $derived({
		name: cleanName,
		club_id: CLUB_ID,
		...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)),
		...(image !== '' ? { image } : {})
	});

	onMount(() => {
		if (!$local.caller_id || !$local.device_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Ladder</strong><br />create</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div
			class="round-icon-big"
			style="background-image: url('{image || '/favicons/icon-512.png'}');"
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

	{#each Object.entries(ladderSettings) as [key, setting] (key)}
		<div class="row right">
			{#if setting.type === 'enum'}
				<select aria-label={setting.label} bind:value={values[key]}>
					{#each Object.keys(setting.values) as option (option)}
						<option value={option}>{setting.label}: {option}</option>
					{/each}
				</select>
			{:else}
				<input
					type="number"
					inputmode="numeric"
					placeholder={`${setting.label} (${setting.default})`}
					aria-label={setting.label}
					min={setting.min}
					max={setting.max}
					step="1"
					bind:value={values[key]}
				/>
			{/if}
			<button class="blue" aria-label={`about ${setting.label}`} onclick={() => (infoKey = infoKey === key ? '' : key)}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Details">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</button>
		</div>
		{#if infoKey === key}
			<div class="row left white">
				<p>
					{#if setting.type === 'enum'}
						{#each Object.entries(setting.values) as [option, description], i (option)}
							{#if i > 0}<br />{/if}<strong>{option}</strong>: {description}
						{/each}
					{:else}
						from {setting.min} to {setting.max}, default {setting.default}
					{/if}
				</p>
			</div>
		{/if}
		{#if setting.type === 'number' && !numberOk(key)}
			<div class="row right"><p class="error">{setting.label} must be a whole number from {setting.min} to {setting.max}</p></div>
		{/if}
	{/each}

	<ApiService
		name="create"
		message={`create the ladder ${cleanName}?`}
		endpoint="ladder/create"
		data={createData}
		disabled={cleanName === '' || !numbersValid}
	/>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
