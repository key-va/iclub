import { relatedEntities, type GuidRow } from '#lib/stores/guids.ts';

// Recorded scores are a single number or comma-separated games per set, eg "6,4"
export const gamesOf = (relation?: Record<string, unknown>): string[] =>
	relation?.score === undefined || relation.score === '' ? [] : String(relation.score).split(',');

// "<winner> wins 6-2 7-5" for a completed match, with each set shown from the winner's side
export function matchSummary(items: GuidRow[], matchId: string): string {
	const players = relatedEntities(items, matchId).filter(player => ['challenger', 'defender'].includes(String(player.relation.role)));
	const winner = players.find((player) => player.relation.result === 'winner');
	if (!winner) return '';
	const loser = players.find((player) => player !== winner);
	const theirs = gamesOf(loser?.relation);
	const sets = gamesOf(winner.relation).map((games, i) => `${games}-${theirs[i] ?? 0}`).join(' ');
	const how = loser?.relation.result === 'forfeiter' ? 'wins by forfeit' : 'wins';
	return `${winner.name} ${how}${sets ? ` ${sets}` : ''}`;
}

// Completed matches (not pending or active) among the given match rows
export const pastMatches = (matches: GuidRow[]) =>
	matches.filter((match) => match.state !== 'pending' && match.state !== 'active');
