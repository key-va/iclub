import { entityOf, nameOf, relationsOf, type GuidRow } from '#lib/stores/guids.ts';
import { gamesOf } from '../matches/matchRules.ts';
import { competitionSlots } from './competitionBracket.ts';

type Standing = {
	entry: GuidRow;
	won: number;
	lost: number;
	setDifference: number;
	gameDifference: number;
	place: number;
};

export function roundRobinStandings(compId: string) {
	const prefix = entityOf(compId)?.format === 'doubles' ? 'pair_' : 'user_';
	const entries = relationsOf(compId).filter((row) =>
		row.rk.startsWith(prefix) &&
		row.is_participant === true
	);
	const standings = new Map(entries.map((entry) => [entry.rk, {
		entry, won: 0, lost: 0, setDifference: 0, gameDifference: 0, place: 0
	} satisfies Standing]));
	const beaten = new Map<string, Set<string>>();
	for (const link of relationsOf(compId)) {
		if (!link.rk.startsWith('match_')) continue;
		const match = entityOf(link.rk);
		if (match?.state !== 'complete') continue;
		const [first, second] = competitionSlots(match);
		if (!first || !second) continue;
		const [winner, loser] = first.result === 'winner' ? [first, second] : [second, first];
		const won = standings.get(winner.rk);
		const lost = standings.get(loser.rk);
		if (winner.result !== 'winner' || !won || !lost) continue;
		won.won++;
		lost.lost++;
		if (!beaten.has(winner.rk)) beaten.set(winner.rk, new Set());
		beaten.get(winner.rk)!.add(loser.rk);
		const loserGames = gamesOf(loser);
		const scores = gamesOf(winner).map((games, index) => Number(games) - Number(loserGames[index]));
		const sets = scores.reduce((sum, difference) => sum + Math.sign(difference), 0);
		const games = scores.reduce((sum, difference) => sum + difference, 0);
		won.setDifference += sets;
		lost.setDifference -= sets;
		won.gameDifference += games;
		lost.gameDifference -= games;
	}

	const byWins = new Map<number, Standing[]>();
	for (const standing of standings.values()) {
		if (!byWins.has(standing.won)) byWins.set(standing.won, []);
		byWins.get(standing.won)!.push(standing);
	}
	const ranked: Standing[] = [];
	for (const wins of [...byWins.keys()].sort((a, b) => b - a)) {
		const group = byWins.get(wins)!;
		const compare = (a: Standing, b: Standing) =>
			(group.length === 2
				? Number(beaten.get(b.entry.rk)?.has(a.entry.rk) ?? false) -
					Number(beaten.get(a.entry.rk)?.has(b.entry.rk) ?? false)
				: 0) || b.setDifference - a.setDifference || b.gameDifference - a.gameDifference;
		group.sort((a, b) => compare(a, b) || nameOf(a.entry.rk).localeCompare(nameOf(b.entry.rk)));
		for (const [index, row] of group.entries()) {
			const previous = group[index - 1];
			row.place = previous && compare(previous, row) === 0 ? previous.place : ranked.length + 1;
			ranked.push(row);
		}
	}
	return ranked;
}
