import { get } from 'svelte/store';
import {
	local,
	setLocalData,
	clearLocalData,
	type Local
} from '#lib/stores/local.ts';

// Keep authentication behaviour here; local.ts owns persistence only.
export function setSession(identity: Local): void {
	setLocalData(identity);
}

export async function clearSession(): Promise<void> {
	try {
		// Push uses remote.ts for signed removal; load it only when ending a session.
		const { disconnectPush } = await import('#lib/stores/push.ts');
		await disconnectPush();
	} catch (error) {
		console.error('[Web Push] logout cleanup failed', error);
	} finally {
		clearLocalData();
	}
}

// Fresh ECDSA P-256 key pair: the private key stays on the device (PKCS8), the public
// key (SPKI) is registered with the API.
export async function generateKeyPair(): Promise<{
	privateKey: string;
	publicKey: string;
}> {
	const pair = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify']
	);

	const encode = (buffer: ArrayBuffer) =>
		btoa(String.fromCharCode(...new Uint8Array(buffer)));

	return {
		privateKey: encode(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
		publicKey: encode(await crypto.subtle.exportKey('spki', pair.publicKey))
	};
}

// Must match buildSignedMessage() in the API: only caller, device and URL path are signed.
export async function signRequest(path: string): Promise<{
	caller_id: string;
	device_id: string;
	signature: string;
}> {
	const { caller_id, device_id, connect_key } = get(local);

	if (!caller_id || !device_id || !connect_key) {
		throw new Error('You need to log in first');
	}

	const message = JSON.stringify([
		caller_id,
		device_id,
		new URL(path, 'http://localhost').pathname
	]);

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

	return {
		caller_id,
		device_id,
		signature: btoa(String.fromCharCode(...new Uint8Array(signature)))
	};
}
