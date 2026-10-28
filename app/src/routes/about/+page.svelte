<script lang="ts">
	import { local } from '#lib/stores/local.ts';

	const { caller_id, device_id } = $local;
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />about</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
	</div>

    <div class="row center white">
        <p>Intra Club is an application designed to help you manage and participate in club activities, including ladders, events, and teams.</p>
    </div>

</div>

<style>
	.page {
		width: 100%;
	}
</style>
