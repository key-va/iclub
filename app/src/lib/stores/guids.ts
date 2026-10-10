import { derived, writable } from 'svelte/store';
import { GUIDS_URL } from '#lib/config.ts';

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

			update((state) => ({
				...state,
				items: json as GuidRow[],
				loading: false,
				refreshing: false,
				loaded: true,
				error: null,
				lastFetchedAt: new Date().toISOString()
			}));

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

// Entity type is the prefix of the entity id, e.g. "user_2026-..." -> "user".
export const typeOf = (id: string) => id.split('_')[0];

export function entityOf(items: GuidRow[], id: string): GuidRow | undefined {
	return items.find((row) => row.pk === typeOf(id) && row.rk === id);
}

export function nameOf(items: GuidRow[], id: string): string {
	return entityOf(items, id)?.name ?? id;
}

export function entitiesOfType(items: GuidRow[], type: string): GuidRow[] {
	return items.filter((row) => row.pk === type);
}

// Relations leaving an entity (each relation is stored in both directions).
export function relationsOf(items: GuidRow[], id: string): GuidRow[] {
	return items.filter((row) => row.pk === id);
}

// Entities connected to `id`, optionally restricted to one entity type.
// Each result carries the relation attributes under `relation`.
export function relatedEntities(
	items: GuidRow[],
	id: string,
	type?: string
): (GuidRow & { relation: GuidRow })[] {
	const related: (GuidRow & { relation: GuidRow })[] = [];

	for (const relation of relationsOf(items, id)) {
		if (type && typeOf(relation.rk) !== type) continue;

		const entity = entityOf(items, relation.rk);

		if (entity) related.push({ ...entity, relation });
	}

	return related;
}

export const entities = derived(guids, ($guids) => $guids.items.filter((row) => !isRelation(row)));
