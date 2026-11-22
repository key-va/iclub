// Ladder labels, descriptions and options. The API validates the same rules inline in api/src/functions/ladderCreate.ts.

type LadderSetting =
	| {
			type: 'enum';
			label: string;
			default: string;
			description: string;
			values: Record<string, { label: string; description: string }>;
	  }
	| {
			type: 'number';
			label: string;
			default: number;
			description: string;
			min: number;
			max: number;
	  };

export const matchFormatSetting = {
	type: 'enum',
	label: 'match format',
	default: 'super_set',
	description: 'how a challenge match is played',
	values: {
		super_set: {
			label: 'Super set',
			description:
				'a single long set played to 8 with a tiebreak at 7 games each'
		},
		best_of_three: {
			label: 'Best of three',
			description:
				'first to win two full sets to 6, with super tiebreak to 10 at 1 set each'
		},
		fast_four: {
			label: 'Fast four',
			description:
				'first to win two short sets to 4, with tiebreak at 3 games each and one fault per service game'
		}
	}
} as const;

export const ladderSettings: Record<string, LadderSetting> = {
	format: {
		type: 'enum',
		label: 'format',
		default: 'singles',
		description: 'whether players compete alone or in pairs',
		values: {
			singles: { label: 'Singles', description: 'one player per side' },
			doubles: { label: 'Doubles', description: 'two players per side' }
		}
	},
	match_format: matchFormatSetting,
	ladder_system: {
		type: 'enum',
		label: 'ladder system',
		default: 'win_points',
		description: 'how results move players up and down the ladder',
		values: {
			win_points: {
				label: 'Win points',
				description:
					'players earn points with match wins and trade points to challenge up the ladder.'
			},
			half_rank: {
				label: 'Half rank',
				description:
					'players can challenge up to half their own rank up the ladder'
			},
			the_percent_fixed: {
				label: 'Ten percent fixed',
				description:
					'players can challenge up to 10% of the ladder ahead of their own ranking'
			},
			static_1: {
				label: 'Up to 1 rank',
				description: 'players may challenge up to 1 rank above them.'
			}
		}
	},
	cool_period: {
		type: 'number',
		label: 'cool period',
		default: 3,
		description:
			'days a player has to accept a challenge and must wait after a loss before issuing another challenge.',
		min: 1,
		max: 9
	},
	play_period: {
		type: 'number',
		label: 'play period',
		default: 9,
		description: 'days allowed to play an accepted challenge',
		min: 1,
		max: 28
	}
};

export const ladderSettingDefaults: Record<string, string | number> =
	Object.fromEntries(
		Object.entries(ladderSettings).map(([key, setting]) => [
			key,
			setting.default
		])
	);
