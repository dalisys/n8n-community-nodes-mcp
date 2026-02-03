const SEARCH_BASE_URL = "https://registry.npmjs.org/-/v1/search";

type Fetcher = typeof fetch;

type NpmSearchPackage = {
	name: string;
	version?: string;
	description?: string;
	keywords?: string[];
	links?: {
		npm?: string;
		homepage?: string;
		repository?: string;
	};
};

type NpmSearchScoreDetail = {
	popularity?: number;
	quality?: number;
	maintenance?: number;
};

type NpmSearchScore = {
	final?: number;
	detail?: NpmSearchScoreDetail;
};

type NpmSearchObject = {
	package: NpmSearchPackage;
	score?: NpmSearchScore;
	searchScore?: number;
};

type NpmSearchResponse = {
	objects: NpmSearchObject[];
	total: number;
};

export class NpmSearchError extends Error {
	status: number;
	url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = "NpmSearchError";
		this.status = status;
		this.url = url;
	}
}

const buildSearchUrl = (text: string, size: number, from = 0) => {
	const url = new URL(SEARCH_BASE_URL);
	url.searchParams.set("text", text);
	url.searchParams.set("size", String(size));
	url.searchParams.set("from", String(from));
	return url.toString();
};

const parseJson = async <T>(response: Response, url: string): Promise<T> => {
	try {
		return (await response.json()) as T;
	} catch (error) {
		throw new NpmSearchError("Invalid JSON response", response.status, url);
	}
};

const fetchJson = async <T>(fetcher: Fetcher, url: string) => {
	const response = await fetcher(url, {
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new NpmSearchError(
			`Request failed with status ${response.status}`,
			response.status,
			url,
		);
	}

	return parseJson<T>(response, url);
};

export const createNpmSearchClient = (fetcher: Fetcher = fetch) => ({
	search: async (text: string, size: number, from = 0) => {
		const url = buildSearchUrl(text, size, from);
		const data = await fetchJson<NpmSearchResponse>(fetcher, url);
		return {
			total: data.total,
			objects: data.objects,
		};
	},
});

export const npmSearchClient = createNpmSearchClient();

export type { NpmSearchObject, NpmSearchPackage, NpmSearchResponse };

export const npmSearchUrls = {
	buildSearchUrl,
};
