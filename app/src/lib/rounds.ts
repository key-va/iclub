import {
	relatedEntities,
	relationsOf,
	type GuidRow,
} from '#lib/stores/guids.ts';
export const roundRoleColour: Record<string, string> = {
	selected: 'green',
	available: 'blue',
	unavailable: 'red',
	pending: 'grey',
};
export const isTeamMember = (role: unknown) =>
	role === 'is_admin' || role === 'is_member';
// Read the new stored contract while older datasets remain visible until refresh.
// These aliases are derived views, never copies persisted back to guids.json.
export function roundView<T extends GuidRow>(
	round: T,
	teamRelation?: GuidRow,
): T {
	const view: GuidRow = { ...round };
	// Entity fallback keeps pre-migration datasets readable until a team refresh.
	view.result = teamRelation?.result ?? round.result;
	for (const key of [
		'number',
		'date',
		'opponent',
		'venue',
		'points_for',
		'points_against',
		'sets_for',
		'sets_against',
		'games_for',
		'games_against',
	]) {
		view[key] = round[`ext_${key}`] ?? round[key];
	}
	view.state =
		round.state ??
		(['completed', 'bye', 'washout'].includes(String(round.status))
			? 'complete'
			: 'pending');
	if (round.state === undefined && view.result === undefined) {
		if (round.status === 'bye' || round.status === 'washout')
			view.result = round.status;
		else if (
			round.status === 'completed' &&
			typeof view.points_for === 'number' &&
			typeof view.points_against === 'number'
		)
			view.result =
				view.points_for === view.points_against
					? 'draw'
					: view.points_for > view.points_against
						? 'winner'
						: 'loser';
		if (round.status === 'postponed') view.condition = 'postponed'; // legacy display only
	}
	delete view.status;
	return view as T;
}
export function teamView<T extends GuidRow>(team: T): T {
	const view: GuidRow = { ...team };
	for (const key of [
		'competition_name',
		'section_name',
		'standings',
		'calendar',
		'rank',
		'wins',
		'points',
		'percentage',
	])
		view[key] = team[`ext_${key}`] ?? team[key];
	return view as T;
}
export function roundLabel(round: GuidRow): string {
	if (round.result === 'bye' || round.result === 'washout') return round.result;
	if (
		round.state === 'pending' &&
		(round.condition === 'postponed' ||
			/postpon/i.test(String(round.ext_status ?? '')))
	)
		return 'postponed';
	return String(round.state ?? 'pending');
}
export function upcomingTeamRounds(
	items: GuidRow[],
	userId: string,
	teamId: string,
	today: string,
) {
	const teamRounds = new Map(
		relationsOf(items, teamId)
			.filter((relation) => relation.rk.startsWith('round_'))
			.map((relation) => [relation.rk, relation]),
	);
	return relatedEntities(items, userId, 'round')
		.map((round) => roundView(round, teamRounds.get(round.rk)))
		.filter(
			(round) =>
				teamRounds.has(round.rk) &&
				String(round.date) >= today &&
				round.state !== 'complete',
		)
		.sort(
			(a, b) =>
				String(a.date).localeCompare(String(b.date)) ||
				Number(a.number) - Number(b.number),
		);
}
export function officialResult(record: GuidRow, teamRelation?: GuidRow) {
	const round = roundView(record, teamRelation);
	if (
		round.state !== 'complete' ||
		['bye', 'washout'].includes(String(round.result))
	)
		return roundLabel(round);
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
