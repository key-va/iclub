<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { local } from '#lib/stores/local.ts';
	import { branding } from '#lib/stores/branding.ts';
	import { callApi } from '#lib/stores/remote.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	type Option = { id: string; name: string };
	let association = $state('');
	let competition = $state('');
	let section = $state('');
	let team = $state('');
	let competitions = $state<Option[]>([]);
	let sections = $state<Option[]>([]);
	let teams = $state<Option[]>([]);
	let loading = $state(false);
	let error = $state('');
	let sequence = 0;
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();
	async function pickImage() {
		image = '';
		imageError = '';
		const file = fileInput?.files?.[0];
		if (!file) return;
		try {
			const bitmap = await createImageBitmap(file);
			const side = Math.min(bitmap.width, bitmap.height);
			const size = Math.min(512, side);
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
			imageError = 'That image could not be read';
		}
	}
	async function load(level: 'association' | 'competition' | 'section') {
		const current = ++sequence;
		error = '';
		if (level === 'association') {
			competition = '';
			competitions = [];
		}
		if (level !== 'section') {
			section = '';
			sections = [];
		}
		team = '';
		teams = [];
		if (
			!association ||
			(level === 'competition' && !competition) ||
			(level === 'section' && !section)
		) {
			loading = false;
			return;
		}
		loading = true;
		try {
			const response = await callApi<{ kind: string; options: Option[] }>(
				'team/options',
				{
					association,
					...(competition ? { competition } : {}),
					...(section ? { section } : {}),
				},
				false,
			);
			if (current !== sequence) return;
			if (response.data?.kind === 'competitions')
				competitions = response.data.options;
			else if (response.data?.kind === 'sections')
				sections = response.data.options;
			else if (response.data?.kind === 'teams') teams = response.data.options;
		} catch (e) {
			if (current === sequence)
				error = e instanceof Error ? e.message : 'Options could not be loaded';
		} finally {
			if (current === sequence) loading = false;
		}
	}
	onMount(() => {
		if (!$local.caller_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	<div class="row right">
		<p><strong>Request a Team</strong><br />{$branding.name}</p>
		<div class="blank-icon-small"></div>
	</div>
	<div class="row center">
		<div
			class="round-icon-big"
			style:background-image={`url('${image || $branding.icon}')`}
		></div>
	</div>
	<InstallApp />
	{#if !$branding.clubId}<div class="row right">
			<p>Open your club website to request a team.</p>
		</div>{/if}
	<div class="group">
		<div class="row right">
			<select
				aria-label="Association"
				bind:value={association}
				onchange={() => load('association')}
				><option value="">Select association</option><option value="brta"
					>BRTA</option
				></select
			>
		</div>
		{#if association}<div class="row right">
				<select
					aria-label="Competition and season"
					bind:value={competition}
					disabled={loading}
					onchange={() => load('competition')}
					><option value="">Select competition and season</option
					>{#each competitions as option}<option value={option.id}
							>{option.name}</option
						>{/each}</select
				>
			</div>{/if}
		{#if competition}<div class="row right">
				<select
					aria-label="Section"
					bind:value={section}
					disabled={loading}
					onchange={() => load('section')}
					><option value="">Select section</option
					>{#each sections as option}<option value={option.id}
							>{option.name}</option
						>{/each}</select
				>
			</div>{/if}
		{#if section}<div class="row right">
				<select aria-label="Team" bind:value={team} disabled={loading}
					><option value="">Select team</option>{#each teams as option}<option
							value={option.id}>{option.name}</option
						>{/each}</select
				>
			</div>{/if}
		{#if loading}<div class="row right">
				<p role="status">Loading options…</p>
			</div>{/if}
		{#if error}<div class="row right">
				<p role="alert">{error}</p>
				<button
					class="blue"
					onclick={() =>
						load(
							section ? 'section' : competition ? 'competition' : 'association',
						)}>Retry</button
				>
			</div>{/if}
		<div class="row right">
			<button class="blue" onclick={() => fileInput?.click()}
				>Custom icon</button
			><input
				hidden
				type="file"
				accept="image/*"
				aria-label="Team image"
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}<p role="alert">{imageError}</p>{/if}
	</div>
	<ApiService
		name="request team"
		message="Request this team for your club administrator to approve?"
		endpoint="team/create"
		data={{
			association,
			competition,
			section,
			team,
			...(image ? { image } : {}),
		}}
		disabled={!team || loading || !$branding.clubId}
	/>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
