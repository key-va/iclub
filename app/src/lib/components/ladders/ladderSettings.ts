// Ladder labels and options. The API validates the same rules inline in api/src/functions/ladderCreate.ts.

type LadderSetting =
	| {
			type: 'enum';
			label: string;
			default: string;
			values: Record<string, { label: string }>;
	  }
	| {
			type: 'number';
			label: string;
			default: number;
			min: number;
			max: number;
	  };

export const matchFormatSetting = {
	type: 'enum',
	label: 'match format',
	default: 'super_set',
	values: {
		super_set: { label: 'Super set' },
		best_of_three: { label: 'Best of three' },
		fast_four: { label: 'Fast four' }
	}
} as const;

export const playerFormatSetting = {
	type: 'enum',
	label: 'format',
	default: 'singles',
	values: {
		singles: { label: 'Singles' },
		doubles: { label: 'Doubles' }
	}
} as const;

export const ladderSettings: Record<string, LadderSetting> = {
	format: playerFormatSetting,
	match_format: matchFormatSetting,
	ladder_system: {
		type: 'enum',
		label: 'ladder system',
		default: 'win_points',
		values: {
			win_points: { label: 'Win points' },
			half_rank: { label: 'Half rank' },
			ten_percent_fixed: { label: 'Ten percent fixed' },
			static_1: { label: 'Up to 1 rank' }
		}
	},
	cool_period: {
		type: 'number',
		label: 'cool period',
		default: 3,
		min: 1,
		max: 9
	},
	play_period: {
		type: 'number',
		label: 'play period',
		default: 9,
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
