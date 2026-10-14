<script lang="ts">
	import { onMount } from 'svelte';
	import ApiService from './apiService.svelte';
	import { generateKeyPair } from '#lib/api.ts';
	import { set_local_data } from '#lib/stores/local.ts';
	import type { ApiResponse } from '#lib/api.ts';

	type Step = 'contact' | 'otp' | 'name';

	let step = $state<Step>('contact');
	let contact = $state('');
	let otp = $state('');
	let name = $state('');
	let keys = $state<{ privateKey: string; publicKey: string } | null>(null);

	onMount(async () => {
		keys = await generateKeyPair();
	});

	function onOtp(result: ApiResponse) {
		step = (result.data as { exists: boolean }).exists ? 'otp' : 'name';
	}

	// Both login and create return the new device identity
	function onAuthenticated(result: ApiResponse) {
		const { user_id, device_id } = result.data as { user_id: string; device_id: string };

		set_local_data({ caller_id: user_id, device_id, connect_key: keys!.privateKey });
	}

	const isEmail = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim()));
</script>

<div class="login">
	{#if step === 'contact'}
		<div class="row right">
			<input type="email" placeholder="email address" autocomplete="email" bind:value={contact} />
		</div>
		<ApiService
			name="continue"
			endpoint="user/otp"
			signed={false}
			confirm={false}
			disabled={!isEmail}
			data={{ email: contact.trim() }}
			onsuccess={onOtp}
		/>
	{:else if step === 'otp'}
		<div class="row right">
			<p class="truncate"><strong>Enter your code</strong><br />sent to {contact}</p>
		</div>
		<div class="row right">
			<input type="text" inputmode="numeric" placeholder="one time code" autocomplete="one-time-code" bind:value={otp} />
		</div>
		<ApiService
			name="login"
			endpoint="user/login"
			signed={false}
			confirm={false}
			disabled={!otp.trim() || !keys}
			data={{ email: contact.trim(), otp: otp.trim(), key: keys?.publicKey }}
			onsuccess={onAuthenticated}
		/>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>Welcome</strong><br />tell us your name to create an account</p>
		</div>
		<div class="row right">
			<input type="text" placeholder="your name" autocomplete="name" bind:value={name} />
		</div>
		<ApiService
			name="create account"
			endpoint="user/create"
			signed={false}
			confirm={false}
			disabled={!name.trim() || !keys}
			data={{ name: name.trim(), email: contact.trim(), key: keys?.publicKey }}
			onsuccess={onAuthenticated}
		/>
	{/if}

	{#if step !== 'contact'}
		<div class="row right">
			<button class="blue" aria-label="start again" onclick={() => ((step = 'contact'), (otp = ''))}>
				<p>start again</p>
			</button>
		</div>
	{/if}
</div>

<style>
	.login {
		position: relative;
		z-index: 1;
	}
</style>
