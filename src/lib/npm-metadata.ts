import type { NpmDownloads, NpmRegistryPackage } from "./npm-registry";

type NormalizedRepository = {
	url: string | null;
	directory: string | null;
};

export type NormalizedNpmMetadata = {
	name: string;
	description: string | null;
	homepage: string | null;
	version: string | null;
	repositoryUrl: string | null;
	repositoryDirectory: string | null;
	downloadsLastWeek: number | null;
};

const stripGitPrefix = (value: string) => value.replace(/^git\+/, "");
const stripGitSuffix = (value: string) => value.replace(/\.git$/, "");

const normalizeRepositoryUrl = (value: string): string | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("github:")) {
		const slug = trimmed.replace(/^github:/, "").replace(/^\/+/, "");
		return slug ? `https://github.com/${slug}` : null;
	}

	if (trimmed.startsWith("git@github.com:")) {
		const slug = trimmed.replace(/^git@github.com:/, "");
		return slug ? `https://github.com/${stripGitSuffix(slug)}` : null;
	}

	return stripGitSuffix(stripGitPrefix(trimmed));
};

const normalizeRepository = (
	repository: NpmRegistryPackage["repository"],
): NormalizedRepository => {
	if (!repository) {
		return { url: null, directory: null };
	}

	if (typeof repository === "string") {
		return { url: normalizeRepositoryUrl(repository), directory: null };
	}

	const url = repository.url ? normalizeRepositoryUrl(repository.url) : null;
	const directory = repository.directory ?? null;
	return { url, directory };
};

export const normalizeNpmMetadata = (
	registry: NpmRegistryPackage,
	downloads: NpmDownloads | null,
): NormalizedNpmMetadata => {
	const repository = normalizeRepository(registry.repository);

	return {
		name: registry.name,
		description: registry.description ?? null,
		homepage: registry.homepage ?? null,
		version: registry["dist-tags"]?.latest ?? null,
		repositoryUrl: repository.url,
		repositoryDirectory: repository.directory,
		downloadsLastWeek: downloads?.downloads ?? null,
	};
};
