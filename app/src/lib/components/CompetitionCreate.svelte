<script lang="ts">
	import SettingHelp from '#lib/components/SettingHelp.svelte';
	import HelpText from '#lib/components/HelpText.svelte';
	import PageActions from '#lib/components/PageActions.svelte';
	import { playerFormatSetting, matchFormatSetting } from './ladders/ladderSettings.ts';
	import { compSystemSetting } from './competitions/compSystemSetting.ts';
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
	const settings = {
		format: playerFormatSetting,
		match_format: matchFormatSetting,
		comp_system: compSystemSetting
	};
	let values = $state<Record<string, string>>({
		format: 'singles', match_format: matchFormatSetting.default, comp_system: 'elimination'
	});
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
		...(isCompetition ? values : {})
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
		{#if showHelp}
			<HelpText topic={`feature.${type}`} />
			<SettingHelp setting="name" label="name" />
			<SettingHelp setting="image" label="image" />
		{/if}
		{#if imageError}
			<div class="row right"><p class="error">{imageError}</p></div>
		{/if}

		{#if isCompetition}
			{#each Object.entries(settings) as [key, setting] (key)}
				<div class="row right">
					<select aria-label={setting.label} bind:value={values[key]}>
						{#each Object.entries(setting.values) as [option, details] (option)}
							<option value={option}>{details.label}</option>
						{/each}
					</select>
				</div>
				{#if showHelp}
					<SettingHelp setting={key} label={setting.label}
						options={Object.entries(setting.values).map(([id, option]) => ({ id, name: option.label }))} />
				{/if}
			{/each}
		{/if}
	</div>

	<PageActions open={showHelp} onclick={() => (showHelp = !showHelp)}>
		<ActionConfirmation
			inline
			name="create"
			message={`create the ${title.toLowerCase()} ${cleanName}?`}
			action={() => (isCompetition ? createCompetition : createGroup)(createData)}
			disabled={cleanName === '' || !$branding.clubId}
		/>
	</PageActions>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
