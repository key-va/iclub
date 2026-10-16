<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import GencRoutLink from '#lib/components/gencRoutLink.svelte';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />browse</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/splash-512.png');"></div>
	</div>

    <div class="row right white">
		<input
			type="text"
			placeholder="filter..."
			autocomplete="off"
			//bind:value={email}
			//onkeydown={(e) => e.key === 'Enter' && getOtp()}
		/>
		<button aria-label="Filter">
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
				<path d="M4 7h16M7 12h10M10 17h4" />
			</svg>
		</button>
	</div>

    <div class="row center">
        <p>with entities listed here</p>
    </div>
    
</div>

<style>
	.page {
		width: 100%;
	}
</style>
