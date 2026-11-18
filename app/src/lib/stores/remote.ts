import { guids } from '#lib/stores/guids.ts';
import { get } from 'svelte/store';
import { API_URL } from '#lib/config.ts';
import { local, generate_signature } from '#lib/stores/local.ts';

// Every endpoint answers with this shape.
export interface ApiResponse<T = unknown> {
	success: boolean;
	message: string;
	subject?: string;
	data?: T;
}

// POST to an endpoint (e.g. "user/abc/update"). Signed calls identify the caller; pre-auth
// calls (otp, login, create) pass `signed: false` and carry everything in `data`.
export async function callApi<T = unknown>(
	endpoint: string,
	data: Record<string, unknown> = {},
	signed = true
): Promise<ApiResponse<T>> {
	const path = `/api/${endpoint.replace(/^\/+/, '')}`;
	const body: Record<string, unknown> = { data };

	if (signed) {
		const { caller_id, device_id } = get(local);

		if (!caller_id || !device_id) throw new Error('You need to log in first');

		body.caller_id = caller_id;
		body.device_id = device_id;
		body.signature = await generate_signature(path);
	}

	const response = await fetch(`${API_URL}/${endpoint.replace(/^\/+/, '')}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;

	if (!response.ok || !result?.success) {
		throw new Error(result?.message || 'request failed');
	}

	return result;
}

// Fresh ECDSA P-256 key pair: the private key stays on the device (PKCS8), the public
// key (SPKI) is registered with the API.
export async function generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

	const encode = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

	return {
		privateKey: encode(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
		publicKey: encode(await crypto.subtle.exportKey('spki', pair.publicKey))
	};
}

// Named mutations own their endpoint/payload and graph refresh. Components only
// execute callbacks; a returned subject is navigation data, not an instruction.
export type NavigationResponse<T = unknown> = ApiResponse<T> & { subject: string };

export class ActionRefreshError extends Error {
	constructor(message: string, public readonly retry: () => Promise<NavigationResponse>) {
		super(message);
		this.name = 'ActionRefreshError';
	}
}

async function mutate(endpoint: string, data: Record<string, unknown> = {}): Promise<NavigationResponse> {
	const result = await callApi(endpoint, data);
	if (!result.subject) throw new Error('The action response did not include a navigation subject.');
	const response: NavigationResponse = { ...result, subject: result.subject };
	const refresh = async (): Promise<NavigationResponse> => {
		try {
			await guids.refresh();
			return response;
		} catch (error) {
			throw new ActionRefreshError(
				`${result.message} (could not refresh: ${error instanceof Error ? error.message : 'unknown error'})`,
				refresh,
			);
		}
	};
	return refresh();
}

export const activateLadder = (ladderId: string) => mutate(`ladder/${ladderId}/activate`);
export const joinLadder = (ladderId: string) => mutate(`ladder/${ladderId}/join`);
export const acceptLadderMember = (ladderId: string, userId: string) =>
	mutate(`ladder/${ladderId}/accept`, { user_id: userId });
export const acceptLadderPair = (ladderId: string, userIds: [string, string]) =>
	mutate(`ladder/${ladderId}/accept`, { user_ids: userIds });
export const createMatch = (ladderId: string, challengerId: string, defenderId: string) =>
	mutate('match/create', { ladder_id: ladderId, challenger_id: challengerId, defender_id: defenderId });
