import { entityOf, relationsOf, type GuidRow } from '#lib/stores/guids.ts';

export function competitionPlayerMatches(compId: string, userId: string) {
	return relationsOf(userId)
		.filter((row) => row.rk.startsWith('match_'))
		.filter((row) => relationsOf(row.rk).some((link) => link.rk === compId));
}

export function activeCompetitionMatches(matches: GuidRow[]) {
	return matches.map((row) => entityOf(row.rk))
		.filter((match): match is GuidRow => match?.state === 'active');
}

export function competitionPlayerStatus(player: GuidRow, matches: GuidRow[]) {
	if (matches.some((row) =>
		(row.result === 'loser' || row.result === 'forfeiter' || row.result === 'walkover') &&
		entityOf(row.rk)?.state === 'complete'
	)) return 'eliminated';
	if (player.state === 'pending') return 'join request pending';
	if (Number(player.seed) > 0) return `ranked ${player.seed}`;
	return player.is_participant === true ? 'unranked' : 'competition admin';
}
