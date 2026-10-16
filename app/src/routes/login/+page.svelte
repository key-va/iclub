<script lang="ts">
	import { fly } from 'svelte/transition';
	import UserLogin from '#lib/components/userLogin.svelte';
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />login</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/splash-512.png');"></div>
	</div>

	<UserLogin />

	<div class="row center">
		<p>or <strong>browse</strong> as a guest</p>
	</div>		
	
</div>

<style>
	.page {
		width: 100%;
	}

</style>
