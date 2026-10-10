<script lang="ts">
	import { onMount } from 'svelte';
	import { ONESIGNAL_APP_ID } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';

	// Legacy OneSignal web SDK (OneSignalSDK.js), loaded below via <svelte:head>.
	/* eslint-disable @typescript-eslint/no-explicit-any */
	const w = () => window as any;
	const OneSignal = () => (w().OneSignal = w().OneSignal || []);

	let ready = $state(false);
	const callerId = $derived($local.caller_id);
	const isLoggedIn = $derived(Boolean($local.caller_id && $local.device_id));

	onMount(() => {
		let disposed = false;

		OneSignal().push(() => {
			if (disposed) return;

			// Only mark ready once the SDK reports it has initialised.
			w().OneSignal.on('initialized', () => {
				if (disposed) return;
				ready = true;
				console.log('[OneSignal] ready');
			});

			w().OneSignal.init({
				appId: ONESIGNAL_APP_ID,
				serviceWorkerPath: '/OneSignalSDKWorker.js',
				serviceWorkerParam: { scope: '/' },
				allowLocalhostAsSecureOrigin: true
			});
		});

		return () => {
			disposed = true;
		};
	});

	// Link the OneSignal subscription to the signed in user, and unlink on logout.
	$effect(() => {
		if (!ready) return;

		if (isLoggedIn && callerId) {
			OneSignal().push(async () => {
				try {
					await w().OneSignal.setExternalUserId(callerId);
					console.log('[OneSignal] external ID set', callerId);

					const perm =
						(await w().OneSignal.getNotificationPermission?.()) || w().Notification.permission;

					if (perm === 'default') {
						await w().OneSignal.registerForPushNotifications();
					}
				} catch (err) {
					console.error('[OneSignal] error setting user or requesting permission', err);
				}
			});
		} else if (!callerId) {
			OneSignal().push(() => w().OneSignal.removeExternalUserId());
			console.log('[OneSignal] external ID cleared');
		}
	});
</script>

<svelte:head>
	<script src="https://cdn.onesignal.com/sdks/OneSignalSDK.js" async></script>
</svelte:head>
