import { relatedEntities, type GuidRow } from '#lib/stores/guids.ts';
export const roundRoleColour: Record<string, string> = {
	selected: 'green',
	available: 'blue',
	unavailable: 'red',
	pending: 'grey',
};
export const isTeamMember = (role: unknown) =>
	role === 'is_admin' || role === 'is_member';
export function upcomingTeamRounds(
	items: GuidRow[],
	userId: string,
	teamId: string,
	today: string,
) {
	return relatedEntities(items, userId, 'round')
		.filter(
			(round) =>
				round.team_id === teamId &&
				String(round.date) >= today &&
				!['completed', 'bye', 'washout'].includes(String(round.status)),
		)
		.sort(
			(a, b) =>
				String(a.date).localeCompare(String(b.date)) ||
				Number(a.number) - Number(b.number),
		);
}
export function officialResult(round: GuidRow) {
	if (round.status !== 'completed') return String(round.status ?? 'scheduled');
	return ['points', 'sets', 'games']
		.filter(
			(key) =>
				round[`${key}_for`] !== undefined &&
				round[`${key}_against`] !== undefined,
		)
		.map((key) => `${round[`${key}_for`]}–${round[`${key}_against`]} ${key}`)
		.join(' · ');
}
export function jsonArray(value: unknown): Record<string, unknown>[] {
	try {
		const parsed = JSON.parse(String(value));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
