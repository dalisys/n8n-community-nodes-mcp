export type RankingWeights = {
	name: number;
	description: number;
	tags: number;
	popularity: number;
};

export const rankingWeights: RankingWeights = {
	name: 0.4,
	description: 0.2,
	tags: 0.3,
	popularity: 0.1,
};
