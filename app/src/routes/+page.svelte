<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { local } from '#lib/stores/local.ts';

	// The home route only decides where to send the user
	onMount(() => {
		const { caller_id, device_id } = $local;

		goto(caller_id && device_id ? `/user/${caller_id}` : '/login', { replaceState: true });
	});
</script>

<div class="row center">
	<p>...loading...</p>
</div>
