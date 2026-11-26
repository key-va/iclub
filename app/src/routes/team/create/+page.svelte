<script lang="ts">
	import PageActions from '#lib/components/PageActions.svelte';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { local } from '#lib/stores/local.ts';
	import { branding } from '#lib/stores/branding.ts';
	import { getTeamOptions, createTeam } from '#lib/stores/remote.ts';

	import EntityHeader from '#lib/components/EntityHeader.svelte';
	type Option = { id: string; name: string };
	let association = $state('');
	let competition = $state('');
	let section = $state('');
	let team = $state('');
	let competitions = $state<Option[]>([]);
	let sections = $state<Option[]>([]);
	let teams = $state<Option[]>([]);
	const teamName = $derived(teams.find((option) => option.id === team)?.name);
	let loading = $state(false);
	let error = $state('');
	let sequence = 0;
	let image = $state('');
	let imageError = $state('');
	let showHelp = $state(false);
	let fileInput = $state<HTMLInputElement>();
	async function pickImage() {
		image = '';
		imageError = '';
		const file = fileInput?.files?.[0];
		if (!file) return;
		try {
			image = await prepareSquareImage(file);
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
			const response = await getTeamOptions({
				association,
				...(competition ? { competition } : {}),
				...(section ? { section } : {})
			});
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
	<EntityHeader
		title="Request a Team"
		subtitle={$branding.name}
		image={image || $branding.icon}
		truncate={false}
	/>
	{#if !$branding.clubId}<div class="row right">
			<p>Open your club website to request a team.</p>
		</div>{/if}
	<div class="group">
		<div class="row right">
			<select
				aria-label="Association"
				bind:value={association}
				onchange={() => load('association')}
			>
				<option value="">Select association</option><option value="brta">
					BRTA
				</option>
			</select>
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
					<path d="M2.5 7h4l1.5-3h8l1.5 3h4v13h-19z" /><circle
						cx="12"
						cy="13.5"
						r="4"
					/>
				</svg>
			</button>
			<input
				hidden
				type="file"
				accept="image/*"
				aria-label="Team image"
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if association}<div class="row right">
				<select
					aria-label="Competition and season"
					bind:value={competition}
					disabled={loading}
					onchange={() => load('competition')}
				>
					<option value="">
						Select competition and season
					</option>{#each competitions as option}<option value={option.id}>
							{option.name}
						</option>{/each}
				</select>
			</div>{/if}
		{#if competition}<div class="row right">
				<select
					aria-label="Section"
					bind:value={section}
					disabled={loading}
					onchange={() => load('section')}
				>
					<option value="">
						Select section
					</option>{#each sections as option}<option value={option.id}>
							{option.name}
						</option>{/each}
				</select>
			</div>{/if}
		{#if section}<div class="row right">
				<select aria-label="Team" bind:value={team} disabled={loading}>
					<option value="">Select team</option>{#each teams as option}<option
							value={option.id}
						>
							{option.name}
						</option>{/each}
				</select>
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
							section ? 'section' : competition ? 'competition' : 'association'
						)}
				>
					Retry
				</button>
			</div>{/if}
		{#if imageError}<p role="alert">{imageError}</p>{/if}
		{#if showHelp}
			<div class="row left">
				<p class="info"><strong>team</strong>: import a team from an external competition data source</p>
			</div>
		{/if}
	</div>
	<PageActions open={showHelp} onclick={() => (showHelp = !showHelp)}>
		<ActionConfirmation
			inline
			name="request team"
			message={`create team ${teamName}?`}
			action={() =>
				createTeam({
					association,
					competition,
					section,
					team,
					...(image ? { image } : {})
				})}
			disabled={!team || loading || !$branding.clubId}
		/>
	</PageActions>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
