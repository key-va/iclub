<script lang="ts">
	import ApiService from './apiService.svelte';
	import { callApi, generateKeyPair } from '#lib/stores/remote.ts';
	import { set_local_data } from '#lib/stores/local.ts';
	import type { ApiResponse } from '#lib/stores/remote.ts';

	type Step = 'contact' | 'otp' | 'create';

	let step = $state<Step>('contact');
	let email = $state('');
	let phone = $state('');
	let otp = $state('');
	let name = $state('');
	let publicKey = $state('');
	let privateKey = $state('');
	let isLoading = $state(false);
	let error = $state('');

	const isEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	// A fresh key pair is made per attempt; the private key is only stored on success
	async function getOtp() {
		if (!isEmail) {
			error = 'please enter a valid email address';
			return;
		}

		isLoading = true;
		error = '';
		step = 'contact';

		try {
			const keys = await generateKeyPair();
			publicKey = keys.publicKey;
			privateKey = keys.privateKey;

			const result = await callApi<{ exists: boolean }>('user/otp', { email: email.trim() }, false);
			step = result.data?.exists ? 'otp' : 'create';
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to request otp code';
		}

		isLoading = false;
	}

	// Both login and create return the new device identity
	function onAuthenticated(result: ApiResponse) {
		const { user_id, device_id } = result.data as { user_id: string; device_id: string };

		set_local_data({ caller_id: user_id, device_id, connect_key: privateKey });
	}
</script>

<div class="login">
	<div class="row right white">
		<input
			type="email"
			placeholder="email@example.com"
			autocomplete="email"
			bind:value={email}
			onkeydown={(e) => e.key === 'Enter' && getOtp()}
		/>
		<button aria-label="Go" disabled={isLoading} onclick={getOtp}>
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
				<path d="M5 12h14M13 5l7 7-7 7" />
			</svg>
		</button>
	</div>

	{#if isLoading}
		<div class="row center"><p>...loading...</p></div>
	{/if}

	{#if error}
		<div class="row center"><p>{error}</p></div>
	{/if}

	{#if step === 'create'}
		<div class="row right">
			<input type="text" placeholder="First Last" autocomplete="name" bind:value={name} />
		</div>
		<div class="row right">
			<input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="61XXXXXXXXX" autocomplete="tel" bind:value={phone} />
		</div>

		<ApiService
			name="create account"
			message="are you sure you want to create an account?"
			endpoint="user/create"
			signed={false}
			disabled={!name.trim()}
			data={{ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, key: publicKey }}
			onsuccess={onAuthenticated}
		/>
	{:else if step === 'otp'}
		<div class="row right">
			<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="XXXXXX" autocomplete="one-time-code" bind:value={otp} />
		</div>

		<ApiService
			name="login"
			message="are you sure you want to login?"
			endpoint="user/login"
			signed={false}
			disabled={!otp.trim()}
			data={{ email: email.trim(), otp: otp.trim(), key: publicKey }}
			onsuccess={onAuthenticated}
		/>
	{/if}
</div>
