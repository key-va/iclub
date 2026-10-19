import { get } from 'svelte/store';
import { ONESIGNAL_APP_ID } from '#lib/config.ts';
import { local } from '#lib/stores/local.ts';

// Legacy OneSignal web SDK (OneSignalSDK.js), loaded by startPush.
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => window as any;
const OneSignal = () => (w().OneSignal = w().OneSignal || []);

const SDK_URL = 'https://cdn.onesignal.com/sdks/OneSignalSDK.js';

// Loads and initialises OneSignal, then links the subscription to the signed in user
// (and unlinks on logout). Returns a function that stops it.
export function startPush(): () => void {
	let disposed = false;
	let ready = false;

	if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
		const script = document.createElement('script');
		script.src = SDK_URL;
		script.async = true;
		document.head.appendChild(script);
	}

	function sync() {
		if (!ready || disposed) return;

		const { caller_id, device_id } = get(local);

		if (caller_id && device_id) {
			OneSignal().push(async () => {
				try {
					await w().OneSignal.setExternalUserId(caller_id);
					console.log('[OneSignal] external ID set', caller_id);

					const perm =
						(await w().OneSignal.getNotificationPermission?.()) || w().Notification.permission;

					if (perm === 'default') {
						await w().OneSignal.registerForPushNotifications();
					}
				} catch (err) {
					console.error('[OneSignal] error setting user or requesting permission', err);
				}
			});
		} else if (!caller_id) {
			OneSignal().push(() => w().OneSignal.removeExternalUserId());
			console.log('[OneSignal] external ID cleared');
		}
	}

	OneSignal().push(() => {
		if (disposed) return;

		// Only sync once the SDK reports it has initialised (the public event is "initialize").
		w().OneSignal.on('initialize', () => {
			if (disposed) return;
			ready = true;
			console.log('[OneSignal] ready');
			sync();
		});

		w().OneSignal.init({
			appId: ONESIGNAL_APP_ID,
			serviceWorkerPath: '/OneSignalSDKWorker.js',
			serviceWorkerParam: { scope: '/' },
			allowLocalhostAsSecureOrigin: true
		});
	});

	const unsubscribe = local.subscribe(sync);

	return () => {
		disposed = true;
		unsubscribe();
	};
}
