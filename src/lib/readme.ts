import type { NpmRegistryPackage } from "./npm-registry";

type ReadmeOptions = {
	registry: NpmRegistryPackage;
	repositoryUrl: string | null;
	repositoryDirectory: string | null;
};

const unique = <T>(items: T[]) => Array.from(new Set(items));

const getReadmeCandidates = (readmeFilename?: string) =>
	unique(
		[readmeFilename, "README.md", "README.mdx", "README.markdown"].filter(
			Boolean,
		),
	) as string[];

const normalizeRepoSlug = (repositoryUrl: string): string | null => {
	try {
		const url = new URL(repositoryUrl);
		if (url.hostname !== "github.com") return null;
		const [owner, repo] = url.pathname
			.replace(/\.git$/, "")
			.split("/")
			.filter(Boolean);
		if (!owner || !repo) return null;
		return `${owner}/${repo}`;
	} catch (error) {
		return null;
	}
};

const buildRawUrls = (
	slug: string,
	readmeCandidates: string[],
	repositoryDirectory: string | null,
) => {
	const baseDir = repositoryDirectory
		? repositoryDirectory.replace(/^\/+|\/+$/g, "")
		: "";
	const directoryPrefix = baseDir ? `${baseDir}/` : "";
	const branches = ["main", "master"];
	const urls: string[] = [];

	for (const branch of branches) {
		for (const filename of readmeCandidates) {
			urls.push(
				`https://raw.githubusercontent.com/${slug}/${branch}/${directoryPrefix}${filename}`,
			);
		}
	}

	return urls;
};

const fetchText = async (url: string) => {
	const response = await fetch(url, { headers: { accept: "text/plain" } });
	if (!response.ok) return null;
	return response.text();
};

export const fetchReadme = async ({
	registry,
	repositoryUrl,
	repositoryDirectory,
}: ReadmeOptions): Promise<string | null> => {
	const registryReadme = registry.readme?.trim();
	if (registryReadme) return registryReadme;

	if (!repositoryUrl) return null;
	const slug = normalizeRepoSlug(repositoryUrl);
	if (!slug) return null;

	const candidates = getReadmeCandidates(registry.readmeFilename);
	const urls = buildRawUrls(slug, candidates, repositoryDirectory);

	for (const url of urls) {
		const content = await fetchText(url);
		if (content) return content;
	}

	return null;
};
