import {
	relationsOf,
	type GuidRow,
	typeOf,
	entityOf
} from '#lib/stores/guids.ts';
import { ladderSettingDefaults } from '#lib/components/ladders/ladderSettings.ts';

type Relation = Record<string, unknown>;

export interface ChallengeTarget {
	rk: string;
	rank: number;
	relation: Relation;
}

// Whether the target sits within the caller's reach under the ladder system, ignoring either player's state.
// win_points costs one point per rank climbed.
export function inReach(
	ladder: Record<string, unknown> | undefined,
	me: Relation | undefined,
	callerId: string | null,
	target: ChallengeTarget
) {
	if (!me || me.is_participant !== true || target.rk === callerId) return false;
	const myRank = Number(me.rank);
	const steps = myRank - target.rank;
	if (!(steps > 0)) return false;
	const system = String(
		ladder?.ladder_system ?? ladderSettingDefaults.ladder_system
	);
	if (system === 'win_points') return Number(me.points) >= steps;
	if (system === 'the_percent_fixed') {
		const competitorType = ladder?.format === 'doubles' ? 'pair' : 'user';
		const count = relationsOf(String(ladder?.rk ?? '')).filter(
			(row) => typeOf(row.rk) === competitorType && row.is_participant === true
		).length;
		return steps <= Math.floor(count / 10);
	}
	if (system === 'half_rank') return steps <= Math.floor(myRank / 2);
	return system === 'static_1' && steps <= 1;
}

// Whether the caller may issue a challenge to the target right now (match state is checked separately)
export function canChallenge(
	ladder: Record<string, unknown> | undefined,
	me: Relation | undefined,
	callerId: string | null,
	target: ChallengeTarget
) {
	if (me?.state !== 'active') return false;
	if (
		target.relation.is_participant !== true ||
		!['active', 'cooling'].includes(String(target.relation.state))
	)
		return false;
	return inReach(ladder, me, callerId, target);
}

// User membership/admin flags stay separate from pair competitive standings.
export function ladderMembership(ladder: GuidRow, userId: string | null) {
	const userRelation = relationsOf(ladder.rk).find((row) => row.rk === userId);
	const pair =
		ladder.format === 'doubles' && userId
			? relationsOf(ladder.rk)
					.filter((row) => typeOf(row.rk) === 'pair' && entityOf(row.rk))
					.find(
						(candidate) =>
							candidate.is_participant === true &&
							relationsOf(candidate.rk)
								.filter((row) => typeOf(row.rk) === 'user' && entityOf(row.rk))
								.some((member) => member.rk === userId)
					)
			: undefined;
	return {
		userRelation,
		pair,
		relation: ladder.format === 'doubles' ? pair : userRelation,
		competitorId: ladder.format === 'doubles' ? (pair?.rk ?? null) : userId
	};
}

export const ladderStateColours: Record<string, string> = {
	away: 'red',
	busy: 'gold',
	cooling: 'blue',
	active: 'green'
};

export function challengeDescription(
	target: GuidRow,
	competitorId: string | null,
	eligible: boolean
) {
	const state = String(target.state);
	if (target.rk === competitorId)
		return state === 'active' ? 'available' : state;
	if (state === 'away') return 'away';
	if (state === 'busy') return 'in a match';
	return eligible
		? state === 'active'
			? 'available'
			: state
		: 'cannot challenge';
}
