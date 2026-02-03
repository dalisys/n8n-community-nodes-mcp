import type { NpmSearchObject } from "./npm-search";

type ListItem = {
	name: string;
	package: string;
	description: string | null;
	tags: string[];
	version: string | null;
	downloadsLastWeek: number | null;
};

const normalizeTag = (value: string) => value.trim();
const normalizePackageName = (value: string) => value.trim().toLowerCase();

export const mapSearchObjectToListItem = (
	object: NpmSearchObject,
	matchedTags: string[],
): ListItem => {
	const pkg = object.package;
	const description = pkg.description?.trim() || null;
	const tags = matchedTags.map(normalizeTag).filter(Boolean);
	const name = pkg.name.trim();

	return {
		name,
		package: name,
		description,
		tags,
		version: pkg.version ?? null,
		downloadsLastWeek: null,
	};
};

export const mapSearchResultsToListItems = (
	objects: NpmSearchObject[],
	tag: string,
): ListItem[] =>
	objects.map((object) => mapSearchObjectToListItem(object, [tag]));

export const mapSearchResultsForTags = (
	resultsByTag: Array<{ tag: string; objects: NpmSearchObject[] }>,
): ListItem[] =>
	resultsByTag.flatMap(({ tag, objects }) =>
		mapSearchResultsToListItems(objects, tag),
	);

const mergeListItems = (existing: ListItem, incoming: ListItem): ListItem => {
	const mergedTags = Array.from(new Set([...existing.tags, ...incoming.tags]))
		.map(normalizeTag)
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));

	const description = existing.description ?? incoming.description;
	const version = existing.version ?? incoming.version;
	const downloadsLastWeek =
		existing.downloadsLastWeek ?? incoming.downloadsLastWeek ?? null;

	return {
		...existing,
		description,
		version,
		downloadsLastWeek,
		tags: mergedTags,
	};
};

export const dedupeListItems = (items: ListItem[]): ListItem[] => {
	const merged = new Map<string, ListItem>();

	for (const item of items) {
		const key = normalizePackageName(item.package);
		const existing = merged.get(key);
		merged.set(key, existing ? mergeListItems(existing, item) : item);
	}

	return Array.from(merged.values()).sort((left, right) =>
		left.package.localeCompare(right.package),
	);
};

export type { ListItem };
