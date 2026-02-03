const REGISTRY_BASE_URL = "https://registry.npmjs.org";
const DOWNLOADS_BASE_URL = "https://api.npmjs.org/downloads/point";

type Fetcher = typeof fetch;

type RegistryDistTags = {
	latest?: string;
};

type RegistryRepository =
	| string
	| {
			type?: string;
			url?: string;
			directory?: string;
	  };

export type NpmRegistryPackage = {
	name: string;
	description?: string;
	homepage?: string;
	repository?: RegistryRepository;
	"dist-tags"?: RegistryDistTags;
	readme?: string;
	readmeFilename?: string;
};

export type NpmDownloads = {
	downloads: number;
	start: string;
	end: string;
	package: string;
};

export class NpmRegistryNotFoundError extends Error {
	status = 404;
	packageName: string;
	url: string;

	constructor(packageName: string, url: string) {
		super(`Package not found: ${packageName}`);
		this.name = "NpmRegistryNotFoundError";
		this.packageName = packageName;
		this.url = url;
	}
}

export class NpmRegistryError extends Error {
	status: number;
	url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = "NpmRegistryError";
		this.status = status;
		this.url = url;
	}
}

const buildRegistryUrl = (packageName: string) =>
	`${REGISTRY_BASE_URL}/${encodeURIComponent(packageName.trim())}`;

const buildDownloadsUrl = (packageName: string) =>
	`${DOWNLOADS_BASE_URL}/last-week/${encodeURIComponent(packageName.trim())}`;

const parseJson = async <T>(response: Response, url: string): Promise<T> => {
	try {
		return (await response.json()) as T;
	} catch (error) {
		throw new NpmRegistryError("Invalid JSON response", response.status, url);
	}
};

const fetchJson = async <T>(
	fetcher: Fetcher,
	url: string,
	packageName: string,
) => {
	const response = await fetcher(url, {
		headers: {
			accept: "application/json",
		},
	});

	if (response.status === 404) {
		throw new NpmRegistryNotFoundError(packageName, url);
	}

	if (!response.ok) {
		throw new NpmRegistryError(
			`Request failed with status ${response.status}`,
			response.status,
			url,
		);
	}

	return parseJson<T>(response, url);
};

export const createNpmRegistryClient = (fetcher: Fetcher = fetch) => ({
	getPackage: (packageName: string) =>
		fetchJson<NpmRegistryPackage>(
			fetcher,
			buildRegistryUrl(packageName),
			packageName,
		),
	getDownloadsLastWeek: (packageName: string) =>
		fetchJson<NpmDownloads>(
			fetcher,
			buildDownloadsUrl(packageName),
			packageName,
		),
});

export const npmRegistryClient = createNpmRegistryClient();

export const npmRegistryUrls = {
	buildRegistryUrl,
	buildDownloadsUrl,
};
