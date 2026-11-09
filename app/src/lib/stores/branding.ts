import { browser } from '$app/env';
import { derived } from 'svelte/store';
import { guids, type GuidRow } from '#lib/stores/guids.ts';
import { PUBLIC_URL } from '#lib/config.ts';

export function brandingForHost(items: GuidRow[], hostname: string) {
	const club = items.find(row => row.pk === 'club' && typeof row.url === 'string' && row.url.toLowerCase() === hostname.toLowerCase());
	const colour = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
	return {
		clubId: club?.rk ?? null,
		name: club?.name || 'Intra Club',
		foreground: colour(club?.foreground, '#FF1493'),
		background: colour(club?.background, '#00BFFF'),
		icon: club ? `${PUBLIC_URL}/${club.rk}.jpg` : '/favicons/icon-00.png',
		appleIcon: club ? `${PUBLIC_URL}/${club.rk}_180.png` : '/favicons/favicon-180.png'
	};
}

export const branding = derived(guids, state => brandingForHost(state.items, browser ? window.location.hostname : ''));
