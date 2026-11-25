<script lang="ts">
	import { page } from '$app/state';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import EntityActions from '#lib/components/EntityActions.svelte';
	import ActionLink from '#lib/components/ActionLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import { entityOf, guids, relationsOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	const id = $derived(page.params.club_id ?? '');
	const club = $derived(entityOf(id));
	const admin = $derived(relationsOf(id).some(row =>
		row.rk === $local.caller_id && row.is_admin === true
	));
</script>

<div class="page">
	{#if club?.pk === 'club'}
		<EntityHeader entity={club} />
		<div class="group">
			<HiddenOptions title="Club Info" />
			{#if club.rules || club.contact_name || club.contact_email || club.address}
				<div class="row left">
					<div class="club-details">
						{#if typeof club.rules === 'string' && club.rules}<p class="info">{club.rules}</p>{/if}
						{#if typeof club.contact_name === 'string' && club.contact_name}<p class="info">{club.contact_name}</p>{/if}
						{#if typeof club.contact_email === 'string' && club.contact_email}
							<p class="info"><a href={`mailto:${club.contact_email}`}>{club.contact_email}</a></p>
						{/if}
						{#if typeof club.address === 'string' && club.address}<p class="info">{club.address}</p>{/if}
					</div>
				</div>
			{/if}
		</div>
		{#if admin}
			<EntityActions section="options">
				{#snippet options()}<ActionLink href={`/club/${id}/edit`} />{/snippet}
			</EntityActions>
		{/if}
	{:else}
		<EntityHeader title={$guids.loaded ? 'Not found' : 'Loading'} subtitle="club" />
	{/if}
</div>

<style>
	.page { width: 100%; }
	.club-details { white-space: pre-line; overflow-wrap: anywhere; }
</style>
