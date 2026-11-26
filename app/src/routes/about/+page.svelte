<script lang="ts">
	import EntityActions from '#lib/components/EntityActions.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { local } from '#lib/stores/local.ts';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="about" image={$branding.icon} />
	<EntityActions>
		{#snippet help()}<p class="info">Open Browse to find ladders, competitions, teams and groups.</p>{/snippet}
	</EntityActions>

    <div class="group">
	<div class="row center">
            <p class="info"><strong>{$branding.name}</strong></p>
        </div>
        <div class="row center">
            <p class="info">Intra Club helps you manage and participate in ladders, events, and teams.</p>
        </div>
    </div>

</div>

<style>
	.page {
		width: 100%;
	}
</style>
