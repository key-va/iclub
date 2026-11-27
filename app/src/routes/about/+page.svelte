<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
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
		{#snippet help()}<HelpText topic="feature.about" />{/snippet}
	</SummaryHelp>

</div>

<style>
	.page {
		width: 100%;
	}
</style>
