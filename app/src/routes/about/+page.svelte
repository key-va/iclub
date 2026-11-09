<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import InstallApp from '#lib/components/installApp.svelte';
	import { local } from '#lib/stores/local.ts';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>{$branding.name}</strong><br />about</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('{$branding.icon}');"></div>
	</div>
	<InstallApp />

    <div class="group">
        <div class="row center">
            <p>{$branding.name} is an application designed to help you manage and participate in club activities, including ladders, events, and teams.</p>
        </div>
    </div>

</div>

<style>
	.page {
		width: 100%;
	}
</style>
