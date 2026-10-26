import { get } from 'svelte/store';
import { local } from '#lib/stores/local.ts';
import { callApi } from '#lib/stores/remote.ts';

// Legacy OneSignal web SDK (OneSignalSDK.js), loaded by startPush.
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => window as any;
const OneSignal = () => (w().OneSignal = w().OneSignal || []);

const SDK_URL = 'https://cdn.onesignal.com/sdks/OneSignalSDK.js';

// The OneSignal app ID lives in the API's configuration (Key Vault), so it can be set after
// the app is deployed. Null means it is not configured yet.
async function fetchAppId(): Promise<string | null> {
	const result = await callApi<{ ONESIGNAL_APP_ID: string | null }>('system/about', {}, false);
	return result.data?.ONESIGNAL_APP_ID ?? null;
}

// Loads and initialises OneSignal, then links the subscription to the signed in user
// (and unlinks on logout). Returns a function that stops it.
export function startPush(): () => void {
	let disposed = false;
	let ready = false;
	// iOS only allows the permission prompt from a user gesture, so it is requested on the next tap.
	let askPending = false;

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

					if (perm === 'default' && !askPending) {
						askPending = true;
						const ask = () => {
							askPending = false;
							w().OneSignal.registerForPushNotifications();
						};
						document.addEventListener('pointerup', ask, { once: true });
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

	function init(appId: string) {
		if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
			const script = document.createElement('script');
			script.src = SDK_URL;
			script.async = true;
			document.head.appendChild(script);
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
				appId,
				serviceWorkerPath: '/OneSignalSDKWorker.js',
				serviceWorkerParam: { scope: '/' },
				allowLocalhostAsSecureOrigin: true
			});
		});
	}

	fetchAppId()
		.then((appId) => {
			if (disposed) return;
			if (!appId) {
				console.error('[OneSignal] app ID is not configured on the API; push notifications are unavailable.');
				return;
			}
			init(appId);
		})
		.catch((err) => console.error('[OneSignal] could not fetch app ID from the API', err));

	const unsubscribe = local.subscribe(sync);

	return () => {
		disposed = true;
		unsubscribe();
	};
}
