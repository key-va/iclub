import { get } from 'svelte/store';
import { installed } from '#lib/stores/installed.ts';
import { local } from '#lib/stores/local.ts';
import { callApi } from '#lib/stores/remote.ts';
import { guids } from '#lib/stores/guids.ts';

let pendingSave: Promise<unknown> = Promise.resolve();
let loggingOut = false;

// Called while the current identity is still available for the signed removal.
export async function disconnectPush(): Promise<void> {
	loggingOut = true;
	await pendingSave.catch(() => {});
	if (!('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration('/');
	const subscription = await registration?.pushManager?.getSubscription();
	if (subscription) {
		// Even if the API is unreachable, unsubscribe prevents delivery to the old account.
		await subscription.unsubscribe();
		await callApi('user/push', { subscription: null });
	}
}

export function startPush(): () => void {
	let stop: (() => void) | undefined;
	const unsubscribe = installed.subscribe((value) => {
		if (value && !stop) stop = startInstalledPush();
		else if (!value && stop) { stop(); stop = undefined; }
	});
	return () => { unsubscribe(); stop?.(); };
}

function startInstalledPush(): () => void {
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return () => {};
	let disposed = false;
	let revision = 0;
	let publicKey: string;
	let registration: ServiceWorkerRegistration;
	const report = (error: unknown) => console.error('[Web Push]', error);
	const current = (version: number) => !disposed && !loggingOut && version === revision && get(installed);

	function subscribe(version: number): Promise<unknown> {
		pendingSave = pendingSave.catch(() => {}).then(() => subscribeNow(version));
		return pendingSave;
	}

	async function subscribeNow(version: number) {
		if (!current(version) || Notification.permission !== 'granted') return;
		const identity = get(local);
		if (!identity.caller_id || !identity.device_id) return;
		let subscription = await registration.pushManager.getSubscription();
		if (!current(version)) return;
		const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
		const applicationServerKey = Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), c => c.charCodeAt(0));
		if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
		if (!current(version)) return;
		await callApi('user/push', { subscription: subscription.toJSON() });
	}

	function ask() {
		document.removeEventListener('pointerup', ask);
		const version = revision;
		if (!current(version) || !get(local).caller_id) return;
		// Request directly in the gesture handler, before any await (required on iOS).
		Notification.requestPermission().then(() => subscribe(version)).catch(report);
	}

	function sync() {
		revision++;
		document.removeEventListener('pointerup', ask);
		if (disposed || loggingOut || !registration || !publicKey) return;
		const { caller_id, device_id } = get(local);
		if (!caller_id || !device_id) return;
		if (Notification.permission === 'default') document.addEventListener('pointerup', ask, { once: true });
		else if (Notification.permission === 'granted') subscribe(revision).catch(report);
	}

	const unsubscribe = local.subscribe(() => { loggingOut = false; sync(); });
	window.addEventListener('focus', sync);
	const received = (event: MessageEvent) => {
		if (event.data?.type === 'PUSH_RECEIVED') guids.refresh().catch(report);
	};
	navigator.serviceWorker.addEventListener('message', received);
	(async () => {
		const result = await callApi<{ WEB_PUSH_PUBLIC_KEY: string | null }>('system/about', {}, false);
		if (disposed) return;
		if (!result.data?.WEB_PUSH_PUBLIC_KEY) throw new Error('Web Push is not configured on the API');
		publicKey = result.data.WEB_PUSH_PUBLIC_KEY;
		await navigator.serviceWorker.register('/service.js', { scope: '/' });
		registration = await navigator.serviceWorker.ready;
		sync();
	})().catch(report);

	return () => {
		disposed = true;
		revision++;
		unsubscribe();
		document.removeEventListener('pointerup', ask);
		window.removeEventListener('focus', sync);
		navigator.serviceWorker.removeEventListener('message', received);
	};
}
