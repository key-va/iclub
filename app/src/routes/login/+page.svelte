<script lang="ts">
	import { fly } from 'svelte/transition';
	import UserLogin from '#lib/components/userLogin.svelte';
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />login or create account</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
			<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
		</div>

	<UserLogin />
</div>

<style>
	.page {
		width: 100%;
	}

	.icon {
		width: min(40vw, 12rem);
		height: auto;
	}
</style>
