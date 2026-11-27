<script lang="ts">
	import SettingHelp from '#lib/components/SettingHelp.svelte';
	import HelpText from '#lib/components/HelpText.svelte';
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
	let minToField = $state<number | undefined>(4);
	const validMinimum = $derived(typeof minToField === 'number' && Number.isSafeInteger(minToField) && minToField >= 1);
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
		{#if showHelp}
			<HelpText topic="feature.team" />
			<SettingHelp setting="association" label="association" options={[{ id: 'brta', name: 'BRTA' }]} />
			<SettingHelp setting="image" label="image" />
		{/if}
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
			</div>
			{#if showHelp}
				<SettingHelp setting="competition" label="competition and season" options={competitions} />
				<SettingHelp setting="season" label="season" />
			{/if}
		{/if}
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
			</div>
			{#if showHelp}
				<SettingHelp setting="section" label="section" options={sections} />
			{/if}
		{/if}
		{#if section}<div class="row right">
				<select aria-label="Team" bind:value={team} disabled={loading}>
					<option value="">Select team</option>{#each teams as option}<option
							value={option.id}
						>
							{option.name}
						</option>{/each}
				</select>
			</div>
			{#if showHelp}
				<SettingHelp setting="team" label="team" options={teams} />
			{/if}
		{/if}
		<div class="row right">
			<label for="min-to-field">Minimum to field</label>
			<input id="min-to-field" type="number" min="1" step="1" required bind:value={minToField} />
		</div>
		{#if showHelp}<SettingHelp setting="team.min_to_field" label="Minimum to field" />{/if}
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
					min_to_field: minToField,
					...(image ? { image } : {})
				})}
			disabled={!team || !validMinimum || loading || !$branding.clubId}
		/>
	</PageActions>
</div>

<style>
	.page {
		width: 100%;
	}
</style>
