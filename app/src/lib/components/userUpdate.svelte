<script lang="ts">
	import ApiService from './apiService.svelte';
	import type { GuidRow } from '#lib/stores/guids.ts';

	let { user }: { user: GuidRow } = $props();

	let name = $state('');
	let email = $state('');
	let phone = $state('');

	// Seed the form from the entity; email and phone are private so they start empty
	$effect(() => {
		name = user.name ?? '';
	});

	const data = $derived({
		...(name.trim() && name.trim() !== user.name ? { name: name.trim() } : {}),
		...(email.trim() ? { email: email.trim() } : {}),
		...(phone.trim() ? { phone: phone.trim() } : {})
	});
</script>

<div class="row right">
	<input type="text" placeholder="name" bind:value={name} />
</div>
<div class="row right">
	<input type="email" placeholder="new email (optional)" bind:value={email} />
</div>
<div class="row right">
	<input type="tel" placeholder="new phone (optional)" bind:value={phone} />
</div>

<ApiService
	name="update"
	message="update your details?"
	endpoint={`user/${user.rk}/update`}
	{data}
	disabled={Object.keys(data).length === 0}
/>
