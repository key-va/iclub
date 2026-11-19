<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relationsOf, imageOf } from '#lib/stores/guids.ts';
	import { isTeamAdmin } from '#lib/components/rounds/roundRules.ts';
	import { prepareSquareImage } from '#lib/components/images/prepareSquareImage.ts';
	import { updateTeam } from '#lib/stores/remote.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import ActionConfirmation from '#lib/components/ActionConfirmation.svelte';
	const teamId = $derived(page.params.team_id ?? '');
	const team = $derived(entityOf(teamId));
	const admin = $derived(
		isTeamAdmin(relationsOf(teamId).find((row) => row.rk === $local.caller_id))
	);
	let image = $state('');
	let imageError = $state('');
	let fileInput = $state<HTMLInputElement>();
	async function pickImage() {
		image = '';
		imageError = '';
		const file = fileInput?.files?.[0];
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
	{#if team && admin}
		<EntityHeader
			entity={team}
			subtitle="edit"
			image={image || imageOf(team.rk)}
		/>
		<div class="row right">
			<input
				type="text"
				aria-label="team name"
				value={team.name ?? ''}
				readonly
			/>
			<button
				class="blue"
				aria-label="change icon"
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
					aria-hidden="true"
				>
					<path d="M2.5 7h4l1.5-3h8l1.5 3h4v13h-19z" /><circle
						cx="12"
						cy="13.5"
						r="4"
					/>
				</svg>
			</button>
			<input
				type="file"
				accept="image/*"
				aria-label="team icon"
				hidden
				bind:this={fileInput}
				onchange={pickImage}
			/>
		</div>
		{#if imageError}<div class="row right">
				<p class="error">{imageError}</p>
			</div>{/if}
		<p class="info center">The team name is fixed. You can change its icon.</p>
		<ActionConfirmation
			name="update"
			message="Update the team icon?"
			action={() => updateTeam(teamId, { image })}
			disabled={!image}
			onsuccess={clearForm}
		/>
	{:else}
		<div class="row right">
			<p>
				{$guids.loaded
					? team
						? 'Only a team admin can edit this team'
						: 'Team not found'
					: 'Loading…'}
			</p>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>
