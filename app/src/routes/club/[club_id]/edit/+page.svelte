<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { entityOf, guids, relationsOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { updateClub } from '#lib/stores/remote.ts';

	const id = $derived(page.params.club_id ?? '');
	const club = $derived(entityOf(id));
	const admin = $derived(relationsOf(id).some(row =>
		row.rk === $local.caller_id && row.is_admin === true
	));
	const fields = [
		{ key: 'contact_name', label: 'Contact name', maxLength: 120 },
		{ key: 'contact_email', label: 'Contact email', maxLength: 254 },
		{ key: 'address', label: 'Address', maxLength: 500 },
		{ key: 'rules', label: 'Club rules', maxLength: 5000 },
		{ key: 'foreground', label: 'Foreground colour', maxLength: 7 },
		{ key: 'background', label: 'Background colour', maxLength: 7 }
	] as const;
	let draft = $state<Partial<Record<(typeof fields)[number]['key'], string>>>({});
	const changes = $derived(Object.fromEntries(
		fields.flatMap(({ key }) => {
			const value = draft[key]?.trim();
			return value !== undefined && value !== String(club?.[key] ?? '') ? [[key, value]] : [];
		})
	));
	let name = $state<string>();
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();
	let validEmail = $state(true);
	const clubName = $derived(name ?? String(club?.name ?? ''));
	const nameChanged = $derived(clubName.trim() !== club?.name);
	async function pickImage() {
		image = '';
		imageError = '';
		const file = fileInput?.files?.[0];
		if (!file) return;
		try {
			image = await prepareSquareImage(file, 512);
		} catch {
			imageError = 'that file could not be read as an image';
		}
	}
	function clearForm() {
		name = undefined;
		draft = {};
		image = '';
		imageError = '';
		validEmail = true;
		if (fileInput) fileInput.value = '';
	}
	onMount(() => {
		if (!$local.caller_id || !$local.device_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	{#if club?.pk === 'club' && admin}
		<EntityHeader entity={club} image={image || undefined} />
		<div class="row right">
			<input type="text" aria-label="club name" placeholder="Club name" maxlength={120}
				value={clubName} oninput={(event) => { name = event.currentTarget.value; }} />
			<button class="blue" aria-label="change icon" onclick={() => fileInput?.click()}>
				<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor"
					stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M2.5 7h4l1.5-3h8l1.5 3h4v13h-19z" />
					<circle cx="12" cy="13.5" r="4" />
				</svg>
			</button>
			<input type="file" accept="image/*" aria-label="club icon" hidden
				bind:this={fileInput} onchange={pickImage} />
		</div>
		{#if imageError}<div class="row right"><p class="error">{imageError}</p></div>{/if}
		{#each fields as { key, label, maxLength }}
			<div class="row right">
				{#if key === 'address' || key === 'rules'}
					<textarea aria-label={label} placeholder={label} maxlength={maxLength}
						value={draft[key] ?? String(club[key] ?? '')}
						oninput={(event) => { draft[key] = event.currentTarget.value; }}></textarea>
				{:else if key === 'foreground' || key === 'background'}
					<label class="colour-field">
						{label}
						<input type="color" value={draft[key] ?? String(club[key] ?? (key === 'foreground' ? '#ff1493' : '#00bfff'))}
							oninput={(event) => { draft[key] = event.currentTarget.value; }} />
					</label>
				{:else}
					<input type={key === 'contact_email' ? 'email' : 'text'} aria-label={label}
						placeholder={label} maxlength={maxLength}
						value={draft[key] ?? String(club[key] ?? '')}
						oninput={(event) => {
							draft[key] = event.currentTarget.value;
							if (key === 'contact_email') validEmail = event.currentTarget.validity.valid;
						}} />
				{/if}
			</div>
		{/each}
		<ActionConfirmation name="update" arrow message="update the club?"
			action={() => updateClub(id, {
				...changes,
				...(nameChanged ? { name: clubName.trim() } : {}),
				...(image ? { image } : {})
			})}
			disabled={!clubName.trim() || !validEmail || (!nameChanged && !image && !Object.keys(changes).length)}
			onsuccess={clearForm} />
	{:else}
		<EntityHeader title={!$guids.loaded ? 'Loading' : club?.pk === 'club' ? 'Club admin access required' : 'Not found'} subtitle="club" />
	{/if}
</div>

<style>
	.page { width: 100%; }
	.colour-field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		margin: 0 0.5rem;
	}
	.colour-field input { width: 3rem; padding: 0.4rem; }
</style>
