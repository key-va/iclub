import { entityOf, relationsOf, type GuidRow } from '#lib/stores/guids.ts';

export function competitionSlots(match: GuidRow) {
	const players = relationsOf(match.rk).filter((row) => row.rk.startsWith('user_'));
	return [
		players.find((row) => row.slot === 1) ?? players.find((row) => row.rk === match.first_id),
		players.find((row) => row.slot === 2) ?? players.find((row) => row.rk === match.second_id)
	] as const;
}

function placement(parentId: string, type: string, key: string) {
	return relationsOf(parentId)
		.filter((row) => row.rk.startsWith(`${type}_`))
		.flatMap((row) => {
			const entity = entityOf(row.rk);
			return entity ? [{ entity, position: Number(row[key] ?? entity[key]) }] : [];
		})
		.sort((a, b) => a.position - b.position);
}

export const competitionRounds = (id: string) => placement(id, 'round', 'bracket_round');
export const roundMatches = (id: string) => placement(id, 'match', 'bracket_match');

export function nextCompetitionMatch(compId: string, match: GuidRow) {
	const rounds = competitionRounds(compId);
	const roundLink = relationsOf(match.rk).find((row) => row.rk.startsWith('round_'));
	const roundIndex = rounds.findIndex((row) =>
		roundLink ? row.entity.rk === roundLink.rk : row.position === match.bracket_round);
	const nextRound = rounds[roundIndex + 1];
	if (roundIndex < 0 || !nextRound) return;
	const position = Number(roundLink?.bracket_match ?? match.bracket_match);
	return roundMatches(nextRound.entity.rk)
		.find((row) => row.position === Math.ceil(position / 2))?.entity;
}

export function competitionFinal(compId: string) {
	const finalRound = competitionRounds(compId).at(-1);
	return finalRound && roundMatches(finalRound.entity.rk)[0]?.entity;
}

export function competitionChampion(comp: GuidRow) {
	if (comp.state !== 'complete') return '';
	const final = competitionFinal(comp.rk);
	return (final && relationsOf(final.rk).find((row) => row.result === 'winner')?.rk)
		?? (typeof comp.champion_id === 'string' ? comp.champion_id : '');
}
