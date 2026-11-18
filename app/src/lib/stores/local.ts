import { writable } from 'svelte/store';
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

export function setLocalData(data: Local) {
	local.set({ ...initialLocal, ...data });
}

export function clearLocalData() {
	local.set({ ...initialLocal });
}
