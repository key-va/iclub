import { get, writable } from 'svelte/store';
import { STRINGS_URL } from '#lib/config.ts';

type HelpStrings = Readonly<Record<string, string | string[]>>;
type HelpState =
	| { status: 'idle' | 'loading' | 'error' }
	| { status: 'ready'; strings: HelpStrings };

const state = writable<HelpState>({ status: 'idle' });
export const helpStrings = { subscribe: state.subscribe };
let request: Promise<void> | undefined;

export function loadHelpStrings(): Promise<void> {
	if (get(state).status === 'ready') return Promise.resolve();
	request ??= fetchHelpStrings().finally(() => { request = undefined; });
	return request;
}

async function fetchHelpStrings() {
	state.set({ status: 'loading' });
	try {
		const response = await fetch(STRINGS_URL);
		if (!response.ok) throw new Error(`Help request failed (${response.status})`);
		const data: unknown = await response.json();
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error('Invalid help file');
		}
		const strings: Record<string, string | string[]> = {};
		for (const [key, value] of Object.entries(data)) {
			if (!key.startsWith('feature.') && !key.startsWith('settings.')) continue;
			if (key.endsWith('.long')) {
				if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
					strings[key] = value;
				}
			} else if (typeof value === 'string') {
				strings[key] = value;
			}
		}
		if (!Object.keys(strings).length) throw new Error('No help entries');
		state.set({ status: 'ready', strings });
	} catch {
		state.set({ status: 'error' });
	}
}
