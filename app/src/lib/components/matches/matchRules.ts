import { entrantIncludesUser } from '../competitions/competitionPlayers.ts';
import { competitionSlots } from '../competitions/competitionBracket.ts';
import {
	type GuidRow,
	relationsOf,
	entityOf,
	nameOf
} from '#lib/stores/guids.ts';

export function isMatchDefender(links: GuidRow[], callerId: string | null) {
	const user = links.find((row) => row.rk === callerId);
	const defender = links.find((row) => row.role === 'defender');
	return user?.role === 'defender' || (!!defender && user?.competitor_id === defender.rk);
}

export function canAcceptLadderMatch(match: GuidRow, callerId: string | null) {
	if (match.state !== 'pending' || !callerId) return false;
	const links = relationsOf(match.rk);
	const ladder = links.find((row) => row.rk.startsWith('ladder_'));
	if (!ladder) return false;
	return isMatchDefender(links, callerId) ||
		relationsOf(ladder.rk).some((row) => row.rk === callerId && row.is_admin === true);
}

export function canForfeitCompetitionMatch(match: GuidRow, callerId: string | null) {
	const [first, second] = competitionSlots(match);
	return match.state === 'active' && !!first && !!second &&
		(entrantIncludesUser(first.rk, callerId) || entrantIncludesUser(second.rk, callerId));
}

// Recorded scores are a single number or comma-separated games per set, eg "6,4"
export const gamesOf = (relation?: Record<string, unknown>): string[] =>
	relation?.score === undefined || relation.score === ''
		? []
		: String(relation.score).split(',');

// "<winner> wins 6-2 7-5" for a completed match, with each set shown from the winner's side
export function matchSummary(matchId: string): string {
	const players = relationsOf(matchId).filter((player) =>
		['challenger', 'defender', 'competitor'].includes(String(player.role))
	);
	const winner = players.find((player) => player.result === 'winner');
	if (!winner) return '';
	const loser = players.find((player) => player !== winner);
	const theirs = gamesOf(loser);
	const sets = gamesOf(winner)
		.map((games, i) => `${games}-${theirs[i] ?? 0}`)
		.join(' ');
	if (loser?.result === 'walkover' || entityOf(matchId)?.is_walkover) return `${nameOf(winner.rk)} wins by walkover`;
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
