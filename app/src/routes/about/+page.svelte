<script lang="ts">
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import { branding } from '#lib/stores/branding.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { local } from '#lib/stores/local.ts';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<EntityHeader title={$branding.name} subtitle="about" image={$branding.icon} />

	<SummaryHelp summary={$branding.name}>
		<p class="info center">Intra Club helps you manage and participate in ladders, events, and teams.</p>
		{#snippet help()}
			<p class="info">Open Browse to find your club’s activities, or sign in to join and see what needs your attention.</p>
		{/snippet}
	</SummaryHelp>

</div>

<style>
	.page {
		width: 100%;
	}
</style>
