import { get, writable } from 'svelte/store';
import { browser } from '$app/env';

// Device-local identity. connect_key is the base64 PKCS8 EC private key that
// matches the public key registered for this device in the API's auths table.
export interface Local {
	caller_id: string | null;
	device_id: string | null;
	connect_key: string | null;
}

const initialLocal: Local = {
	caller_id: null,
	device_id: null,
	connect_key: null
};

function createLocal() {
	const store = writable<Local>({ ...initialLocal });

	if (browser) {
		const raw = localStorage.getItem('local');

		if (raw) {
			try {
				store.set({ ...initialLocal, ...JSON.parse(raw) });
			} catch (e) {
				console.warn('Failed to parse local from localStorage', e);
			}
		}

		store.subscribe((value) => {
			localStorage.setItem('local', JSON.stringify(value));
		});
	}

	return store;
}

export const local = createLocal();

export const set_caller_id = (id: string) => local.update((s) => ({ ...s, caller_id: id }));
export const set_device_id = (id: string) => local.update((s) => ({ ...s, device_id: id }));
export const set_connect_key = (key: string) => local.update((s) => ({ ...s, connect_key: key }));

export function set_local_data(data: Local) {
	local.set({ ...initialLocal, ...data });
}

export function clear_local_data() {
	local.set({ ...initialLocal });
}

// Must match buildSignedMessage() in the API: only caller, device and URL path are signed.
export async function generate_signature(path: string): Promise<string> {
	const { caller_id, device_id, connect_key } = get(local);

	if (!caller_id || !device_id || !connect_key) {
		throw new Error('missing local auth values');
	}

	const message = JSON.stringify([caller_id, device_id, new URL(path, 'http://localhost').pathname]);

	const privateKey = await crypto.subtle.importKey(
		'pkcs8',
		Uint8Array.from(atob(connect_key), (c) => c.charCodeAt(0)),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: { name: 'SHA-256' } },
		privateKey,
		new TextEncoder().encode(message)
	);

	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
