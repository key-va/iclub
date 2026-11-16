<script lang="ts">
	import { imageOf, type GuidRow } from '#lib/stores/guids.ts';
	import InstallApp from './installApp.svelte';

	let {
		entity,
		title = entity?.name,
		subtitle = entity?.pk,
		image = entity ? imageOf(entity.rk) : null,
		truncate = true,
	}: {
		entity?: GuidRow;
		title?: string;
		subtitle?: unknown;
		image?: string | null;
		truncate?: boolean;
	} = $props();
</script>

<div class="row right">
	<p class:truncate><strong>{title}</strong><br />{subtitle}</p>
	<div class="blank-icon-small"></div>
</div>

{#if image}
	<div class="row center">
		<div class="round-icon-big" style:background-image={`url('${image}')`}></div>
	</div>
	<InstallApp />
{/if}
