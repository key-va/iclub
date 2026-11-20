import {
	type GuidRow,
	relationsOf,
	entityOf,
	nameOf
} from '#lib/stores/guids.ts';

export function canForfeitCompetitionMatch(match: GuidRow, callerId: string | null) {
	return match.state === 'active' && !!callerId && !!match.first_id && !!match.second_id &&
		(callerId === match.first_id || callerId === match.second_id);
}

// Recorded scores are a single number or comma-separated games per set, eg "6,4"
export const gamesOf = (relation?: Record<string, unknown>): string[] =>
	relation?.score === undefined || relation.score === ''
		? []
		: String(relation.score).split(',');

// "<winner> wins 6-2 7-5" for a completed match, with each set shown from the winner's side
export function matchSummary(matchId: string): string {
	const players = relationsOf(matchId).filter((player) =>
		['challenger', 'defender'].includes(String(player.role))
	);
	const winner = players.find((player) => player.result === 'winner');
	if (!winner) return '';
	const loser = players.find((player) => player !== winner);
	const theirs = gamesOf(loser);
	const sets = gamesOf(winner)
		.map((games, i) => `${games}-${theirs[i] ?? 0}`)
		.join(' ');
	if (entityOf(matchId)?.is_walkover) return `${nameOf(winner.rk)} wins by walkover`;
	const how = loser?.result === 'forfeiter' ? 'wins by forfeit' : 'wins';
	return `${nameOf(winner.rk)} ${how}${sets ? ` ${sets}` : ''}`;
}

// Completed matches (not pending or active) among the given match rows
export const pastMatches = (matches: GuidRow[]) =>
	matches.filter(
		(match) =>
			entityOf(match.rk)?.state !== 'pending' &&
			entityOf(match.rk)?.state !== 'active' &&
			entityOf(match.rk)?.state !== 'waiting' &&
			entityOf(match.rk)?.state !== 'bye'
	);
