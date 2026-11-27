import {
	relationsOf,
	type GuidRow,
	typeOf,
	entityOf
} from '#lib/stores/guids.ts';
export const roundRoleColour: Record<string, string> = {
	selected: 'green',
	available: 'blue',
	unavailable: 'red',
	pending: 'orange'
};
export function roundAvailability(roundId: string) {
	const players = relationsOf(roundId).filter((row) => typeOf(row.rk) === 'user');
	const playing = players.filter((row) => row.role === 'selected').length;
	const available = players.filter((row) => row.role === 'available').length;
	const pending = players.filter((row) => row.role === 'pending').length;
	return { playing, available, pending };
}

export const roundAvailabilityLabel = {
	red: 'Short of players to field a team',
	orange: 'Short of players, with availability replies pending',
	blue: 'Lineup to be picked',
	green: 'Lineup ready'
} as const;

export function roundAvailabilityColour(
	{ playing, available, pending }: ReturnType<typeof roundAvailability>,
	minToField: unknown = 4
) {
	const minimum = typeof minToField === 'number' && Number.isSafeInteger(minToField) && minToField > 0
		? minToField
		: 4;
	if (playing >= minimum) return 'green';
	if (playing + available >= minimum) return 'blue';
	return playing + available + pending >= minimum ? 'orange' : 'red';
}

export function roundRoleLabel(role: unknown): string {
	if (role === 'unavailable') return 'out';
	if (role === 'selected') return 'playing';
	return typeof role === 'string' ? role : '';
}

export function futureRoundDescription(round: GuidRow, role: unknown): string {
	const status = roundRoleLabel(role) || 'no status';
	return round.ext_stage && round.is_home === undefined
		? `${status} • ${round.date}`
		: `${status} • ${round.is_home ? 'home' : 'away'} • ${round.date}`;
}

export function isTeamAdmin(relation?: Record<string, unknown>): boolean {
	return typeof relation?.is_admin === 'boolean'
		? relation.is_admin
		: relation?.role === 'is_admin';
}
export const isTeamMember = (relation?: Record<string, unknown>) =>
	isTeamAdmin(relation) ||
	relation?.is_member === true ||
	relation?.role === 'is_member';
export function availabilityOptions(
	role: unknown,
	admin = false
): ('available' | 'unavailable')[] {
	if (role === 'pending') return ['unavailable', 'available'];
	if (role === 'selected') return admin ? ['available'] : ['unavailable'];
	if (role === 'available') return ['unavailable'];
	if (role === 'unavailable') return ['available'];
	return [];
}
export const roundQuickRoles = ['unavailable', 'available', 'selected'] as const;

export function roundQuickOptions(role: unknown, admin: boolean): (typeof roundQuickRoles)[number][] {
	const options: (typeof roundQuickRoles)[number][] = availabilityOptions(role, admin);
	if (admin && role === 'available') options.push('selected');
	return options;
}

// Read the new stored contract while older datasets remain visible until refresh.
// These aliases are derived views, never copies persisted back to guids.json.
export function roundView<T extends GuidRow>(
	round: T,
	teamRelation?: GuidRow
): T {
	const view: GuidRow = { ...round };
	// Entity fallback keeps pre-migration datasets readable until a team refresh.
	view.result = teamRelation?.result ?? round.result;
	view.is_home =
		typeof teamRelation?.is_home === 'boolean'
			? teamRelation.is_home
			: round.home_away === 'home'
				? true
				: round.home_away === 'away'
					? false
					: typeof round.is_home === 'boolean'
						? round.is_home
						: undefined;

	for (const key of [
		'number',
		'date',
		'opponent',
		'venue',
		'venue_address',
		'venue_latitude',
		'venue_longitude',
		'court_type',
		'points_for',
		'points_against',
		'sets_for',
		'sets_against',
		'games_for',
		'games_against'
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
	if (view.result === 'bye') view.is_home = false;
	delete view.home_away;
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
		'percentage'
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
export function outstandingTeamRounds(userId: string, teamId: string) {
	const teamRounds = new Map(
		relationsOf(teamId)
			.filter((row) => typeOf(row.rk) === 'round' && entityOf(row.rk))
			.map((row) => [row.rk, row])
	);
	const viewOf = (row: GuidRow) =>
		roundView(entityOf(row.rk)!, teamRounds.get(row.rk));
	return relationsOf(userId)
		.filter(
			(row) =>
				typeOf(row.rk) === 'round' && entityOf(row.rk) && teamRounds.has(row.rk)
		)
		.filter(
			(row) =>
				['pending', 'selected'].includes(String(row.role)) &&
				!['complete', 'eliminated'].includes(String(viewOf(row).state))
		)
		.sort(
			(a, b) =>
				String(viewOf(a).date).localeCompare(String(viewOf(b).date)) ||
				Number(viewOf(a).number) - Number(viewOf(b).number)
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
				round[`${key}_against`] !== undefined
		)
		.map((key) => `${round[`${key}_for`]}–${round[`${key}_against`]} ${key}`)
		.join(' • ');
}
export function jsonArray(value: unknown): Record<string, unknown>[] {
	try {
		const parsed = JSON.parse(String(value));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

// Shared summary for team pages and team sections on user pages.
export function teamDescription(team?: GuidRow): string {
	if (!team) return '';
	const view = teamView(team);
	return [
		String(team.ext_association ?? team.association ?? '').toUpperCase(),
		view.section_name,
		view.rank != null ? `rank ${view.rank}` : null
	]
		.filter((value) => value != null && value !== '')
		.join(' • ');
}
