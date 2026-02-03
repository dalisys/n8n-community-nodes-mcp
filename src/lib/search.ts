import {
	npmSearchClient,
	NpmSearchError,
	type NpmSearchObject,
} from "./npm-search";
import { dedupeListItems, mapSearchResultsForTags } from "./listing";
import type { ListItem } from "./listing";
import { rankingWeights } from "./search-config";

const DEFAULT_TAGS = [
	"n8n-nodes",
	"n8n-community-node-package",
	"n8n-community-node",
];

type TaggedSearchObjects = {
	tag: string;
	objects: NpmSearchObject[];
};

type SearchPipelineInput = {
	query: string;
	limit: number;
	tags?: string[];
};

type SearchPipelineResult = {
	query: string;
	limit: number;
	total: number;
	results: SearchResultItem[];
	warnings: string[];
	hadSuccess: boolean;
};

const buildSearchText = (query: string, tag: string) => {
	const trimmedQuery = query.trim();
	return trimmedQuery ? `keywords:${tag} ${trimmedQuery}` : `keywords:${tag}`;
};

const fillerPhrasePattern =
	/\\b(?:how to|how do i|how do you|how can i|how can you|for|with|using|use|need|want)\\b/g;

export const normalizeQuery = (input: string) => {
	const trimmed = input.trim().toLowerCase();
	const collapsed = trimmed.replace(/\\s+/g, " ");
	const stripped = collapsed
		.replace(fillerPhrasePattern, " ")
		.replace(/\\s+/g, " ")
		.trim();
	return stripped || collapsed || input.trim();
};

const normalizePackageName = (value: string) => value.trim().toLowerCase();
const normalizeText = (value?: string | null) => (value ?? "").toLowerCase();

const tokenizeQuery = (query: string) =>
	query
		.split(" ")
		.map((token) => token.trim())
		.filter(Boolean);

const clamp = (value: number, min = 0, max = 1) =>
	Math.min(Math.max(value, min), max);

const scoreTokenMatches = (text: string, tokens: string[]) => {
	if (!tokens.length) return 0;
	let matches = 0;
	for (const token of tokens) {
		if (text.includes(token)) {
			matches += 1;
		}
	}
	return matches / tokens.length;
};

const scoreTagMatches = (tags: string[], tokens: string[]) => {
	if (!tokens.length || !tags.length) return 0;
	const normalizedTags = tags.map((tag) => tag.toLowerCase());
	let matches = 0;
	for (const token of tokens) {
		if (normalizedTags.some((tag) => tag.includes(token))) {
			matches += 1;
		}
	}
	return matches / tokens.length;
};

type SearchResultItem = ListItem & { score: number };

const scoreListItems = (
	items: ListItem[],
	options: {
		tokens: string[];
		popularityByPackage: Map<string, number>;
	},
): SearchResultItem[] => {
	const totalWeight =
		rankingWeights.name +
		rankingWeights.description +
		rankingWeights.tags +
		rankingWeights.popularity;
	const weightScale = totalWeight > 0 ? 1 / totalWeight : 0;

	return items.map((item) => {
		const normalizedName = normalizeText(item.name);
		const normalizedDescription = normalizeText(item.description);
		const nameScore = scoreTokenMatches(normalizedName, options.tokens);
		const descriptionScore = scoreTokenMatches(
			normalizedDescription,
			options.tokens,
		);
		const tagScore = scoreTagMatches(item.tags, options.tokens);
		const popularityScore = clamp(
			options.popularityByPackage.get(normalizePackageName(item.package)) ?? 0,
		);
		const weightedScore =
			(nameScore * rankingWeights.name +
				descriptionScore * rankingWeights.description +
				tagScore * rankingWeights.tags +
				popularityScore * rankingWeights.popularity) *
			weightScale;

		return {
			...item,
			score: weightedScore,
		};
	});
};

export const runSearch = async ({
	query,
	limit,
	tags = DEFAULT_TAGS,
}: SearchPipelineInput): Promise<SearchPipelineResult> => {
	const size = Math.min(limit, 50);
	const warnings: string[] = [];
	const normalizedQuery = normalizeQuery(query);

	const searches = await Promise.allSettled(
		tags.map((tag) =>
			npmSearchClient.search(buildSearchText(normalizedQuery, tag), size),
		),
	);

	const resultsByTag: TaggedSearchObjects[] = searches
		.map((result, index) => {
			if (result.status === "fulfilled") {
				return { tag: tags[index], objects: result.value.objects };
			}

			const tagValue = tags[index];
			if (result.reason instanceof NpmSearchError) {
				warnings.push(
					`Failed to search tag ${tagValue}: ${result.reason.message}`,
				);
			} else {
				warnings.push(`Failed to search tag ${tagValue}: unexpected error`);
			}
			return null;
		})
		.filter((entry): entry is TaggedSearchObjects => Boolean(entry));

	const popularityByPackage = new Map<string, number>();
	for (const { objects } of resultsByTag) {
		for (const object of objects) {
			const key = normalizePackageName(object.package.name);
			const popularity = clamp(object.score?.detail?.popularity ?? 0);
			const existing = popularityByPackage.get(key);
			if (existing === undefined || popularity > existing) {
				popularityByPackage.set(key, popularity);
			}
		}
	}

	const items = mapSearchResultsForTags(resultsByTag);
	const merged = dedupeListItems(items);
	const tokens = tokenizeQuery(normalizedQuery);
	const scored = scoreListItems(merged, { tokens, popularityByPackage });
	const ordered = scored
		.map((item, index) => ({ item, index }))
		.sort(
			(left, right) =>
				right.item.score - left.item.score ||
				left.item.package.localeCompare(right.item.package) ||
				left.index - right.index,
		)
		.map(({ item }) => item);
	const limited = ordered.slice(0, limit);

	return {
		query,
		limit,
		total: merged.length,
		results: limited,
		warnings,
		hadSuccess: resultsByTag.length > 0,
	};
};

export type { SearchPipelineInput, SearchPipelineResult };
export const searchDefaults = { DEFAULT_TAGS };
