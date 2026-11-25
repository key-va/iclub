import { createSubscriber } from 'svelte/reactivity';
import { derived, get, writable } from 'svelte/store';
import { GUIDS_URL, PUBLIC_URL } from '#lib/config.ts';

// A row in guids.json is either an entity (pk = entity type, rk = entity id)
// or one direction of a relation (pk = first entity id, rk = second entity id).
export interface GuidRow {
	pk: string;
	rk: string;
	name?: string;
	ts?: string;
	et?: string;
	[attribute: string]: unknown;
}

interface GuidsState {
	items: GuidRow[];
	loading: boolean;
	refreshing: boolean;
	loaded: boolean;
	error: string | null;
	sourceUrl: string;
	lastFetchedAt: string | null;
	autoRefreshMs: number | null;
}

const initialState: GuidsState = {
	items: [],
	loading: false,
	refreshing: false,
	loaded: false,
	error: null,
	sourceUrl: GUIDS_URL,
	lastFetchedAt: null,
	autoRefreshMs: null
};

const rowKey = (row: GuidRow) => `${row.pk}|${row.rk}`;

function sameRow(a: GuidRow, b: GuidRow): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

	for (const key of keys) {
		if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
	}

	return true;
}

// Reuse the existing row objects where nothing changed, and return the previous
// array untouched when the dataset is identical.
function mergeRows(previous: GuidRow[], incoming: GuidRow[]): GuidRow[] {
	const existing = new Map(previous.map((row) => [rowKey(row), row]));
	let changed = previous.length !== incoming.length;

	const merged = incoming.map((row, index) => {
		const old = existing.get(rowKey(row));
		const keep = old && sameRow(old, row) ? old : row;

		if (keep !== previous[index]) changed = true;

		return keep;
	});

	return changed ? merged : previous;
}

function createGuidsStore() {
	const { subscribe, update, set } = writable<GuidsState>({ ...initialState });

	let refreshTimer: ReturnType<typeof setInterval> | null = null;

	async function fetchGuids(isRefresh: boolean, url?: string): Promise<GuidRow[]> {
		let targetUrl = url ?? '';

		update((state) => {
			targetUrl = targetUrl || state.sourceUrl;

			return {
				...state,
				sourceUrl: targetUrl,
				error: null,
				loading: !state.loaded && !isRefresh,
				refreshing: state.loaded || isRefresh
			};
		});

		try {
			// The query string defeats intermediary caches; the client always needs the latest export.
			const separator = targetUrl.includes('?') ? '&' : '?';
			const response = await fetch(`${targetUrl}${separator}t=${Date.now()}`, {
				method: 'GET',
				cache: 'no-store'
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch guids.json (${response.status})`);
			}

			const json: unknown = await response.json();

			if (!Array.isArray(json)) {
				throw new Error('guids.json did not return an array');
			}

			update((state) => {
				const items = mergeRows(state.items, json as GuidRow[]);

				return {
					...state,
					// Same array when nothing changed, so dependants are not invalidated
					items,
					loading: false,
					refreshing: false,
					loaded: true,
					error: null,
					lastFetchedAt: new Date().toISOString()
				};
			});

			return json as GuidRow[];
		} catch (error) {
			update((state) => ({
				...state,
				loading: false,
				refreshing: false,
				error: error instanceof Error ? error.message : String(error)
			}));

			throw error;
		}
	}

	function stopAutoRefresh() {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}

		update((state) => ({ ...state, autoRefreshMs: null }));
	}

	return {
		subscribe,

		// Initial load.
		load: (url?: string) => fetchGuids(false, url),

		// Replace the graph with a fresh copy. Rejects on failure so callers
		// can avoid navigating and let the user retry.
		refresh: () => fetchGuids(true),

		startAutoRefresh(intervalMs: number) {
			stopAutoRefresh();

			if (!intervalMs || intervalMs <= 0) return;

			refreshTimer = setInterval(() => {
				fetchGuids(true).catch(() => {
					// state.error is already set
				});
			}, intervalMs);

			update((state) => ({ ...state, autoRefreshMs: intervalMs }));
		},

		stopAutoRefresh,

		setSourceUrl(url: string) {
			update((state) => ({ ...state, sourceUrl: url }));
		},

		reset() {
			stopAutoRefresh();
			set({ ...initialState });
		}
	};
}

export const guids = createGuidsStore();

// Graph helpers

export const isRelation = (row: GuidRow) => row.pk.includes('_');
export const isEntity = (row: GuidRow) => !isRelation(row);

export const typeOf = (id: string) => id.split('_')[0];
// Every entity page lives at /<type>/<id>, and its image is published as <id>.jpg
export const hrefOf = (id: string) => `/${typeOf(id)}/${id}`;
export const imageOf = (id: string) => `${PUBLIC_URL}/${id}.jpg`;
// Register graph reads with Svelte's current reactive context. Reading through get()
// alone would return fresh data but would not invalidate $derived or templates.
const trackGraph = createSubscriber((update) => {
	let previous = get(guids).items;
	return guids.subscribe(({ items }) => {
		if (items !== previous) {
			previous = items;
			update();
		}
	});
});

function graphItems(): GuidRow[] {
	trackGraph();
	return get(guids).items;
}

export function nameOf(id: string): string {
	return entityOf(id)?.name ?? id;
}

export function entityOf(id: string): GuidRow | undefined {
	return graphItems().find(row => row.pk === typeOf(id) && row.rk === id);
}

// Return raw outgoing relation rows. Entity attributes are resolved separately.
export function relationsOf(id: string): GuidRow[] {
	return graphItems().filter(row => row.pk === id);
}

export function isBrowsableEntity(entity: GuidRow | undefined): entity is GuidRow {
	return !!entity && ['ladder', 'team', 'group', 'comp'].includes(entity.pk) &&
		(entity.state === 'active' || (entity.pk === 'comp' && entity.state === 'open'));
}

export const entities = derived(guids, ($guids) => $guids.items.filter((row) => !isRelation(row)));
