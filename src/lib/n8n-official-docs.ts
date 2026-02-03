const GITHUB_API_BASE = "https://api.github.com";
const RAW_GITHUB_BASE = "https://raw.githubusercontent.com";

type GithubRepoInfo = {
	default_branch: string;
};

type GithubTreeEntry = {
	path: string;
	type: "blob" | "tree";
};

type GithubTreeResponse = {
	tree: GithubTreeEntry[];
};

type OfficialNodeDoc = {
	nodeType: string;
	nodeName: string;
	packageName: "n8n-nodes-base" | "n8n-nodes-langchain";
	path: string;
	docsUrl: string;
	githubUrl: string;
	rawUrl: string;
};

type N8nDocPage = {
	path: string;
	title: string;
	docsUrl: string;
	githubUrl: string;
	rawUrl: string;
};

class GithubApiError extends Error {
	status: number;
	url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = "GithubApiError";
		this.status = status;
		this.url = url;
	}
}

const fetchJson = async <T>(url: string): Promise<T> => {
	const response = await fetch(url, {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": "n8n-community-nodes-mcp",
		},
	});
	if (!response.ok) {
		throw new GithubApiError(
			`GitHub API request failed with status ${response.status}`,
			response.status,
			url,
		);
	}
	return (await response.json()) as T;
};

const fetchText = async (url: string): Promise<string> => {
	const response = await fetch(url, {
		headers: {
			accept: "text/plain",
			"user-agent": "n8n-community-nodes-mcp",
		},
	});
	if (!response.ok) {
		throw new GithubApiError(
			`GitHub raw request failed with status ${response.status}`,
			response.status,
			url,
		);
	}
	return response.text();
};

const getDefaultBranch = async (owner: string, repo: string) => {
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
	const data = await fetchJson<GithubRepoInfo>(url);
	return data.default_branch;
};

const getRepoTree = async (owner: string, repo: string, branch: string) => {
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
	return fetchJson<GithubTreeResponse>(url);
};

const toDocsUrl = (path: string) => {
	const withoutPrefix = path.replace(/^docs\//, "");
	const withoutExtension = withoutPrefix.replace(/\.md$/i, "");
	const withoutIndex = withoutExtension.replace(/\/index$/i, "");
	return `https://docs.n8n.io/${withoutIndex}/`;
};

const toTitle = (path: string) =>
	path
		.split("/")
		.pop()
		?.replace(/\.md$/i, "")
		.replace(/[-_]/g, " ")
		.trim() ?? path;

const normalizeNodeInput = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return trimmed
		.replace(/^n8n-nodes-base\./, "nodes-base.")
		.replace(/^n8n-nodes-langchain\./, "nodes-langchain.")
		.toLowerCase();
};

const scoreByQuery = (text: string, query: string) => {
	const tokens = query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	if (!tokens.length) return 1;
	let matches = 0;
	for (const token of tokens) {
		if (text.includes(token)) matches += 1;
	}
	return matches / tokens.length;
};

const OFFICIAL_NODE_DOC_PATTERN =
	/^docs\/integrations\/builtin\/(?:core-nodes|app-nodes|trigger-nodes|cluster-nodes\/root-nodes|cluster-nodes\/sub-nodes)\/(n8n-nodes-(?:base|langchain)\.([^/]+))(?:\.md|\/index\.md)$/i;

const extractOfficialNodeFromPath = (
	path: string,
	defaultBranch: string,
): OfficialNodeDoc | null => {
	const match = path.match(OFFICIAL_NODE_DOC_PATTERN);
	if (!match) return null;
	const fullNodeName = match[1];
	const nodeName = match[2];
	const packageName = fullNodeName.startsWith("n8n-nodes-base.")
		? "n8n-nodes-base"
		: "n8n-nodes-langchain";
	const nodeType = fullNodeName
		.replace(/^n8n-nodes-base\./, "nodes-base.")
		.replace(/^n8n-nodes-langchain\./, "nodes-langchain.");

	return {
		nodeType,
		nodeName,
		packageName,
		path,
		docsUrl: toDocsUrl(path),
		githubUrl: `https://github.com/n8n-io/n8n-docs/blob/${defaultBranch}/${path}`,
		rawUrl: `${RAW_GITHUB_BASE}/n8n-io/n8n-docs/${defaultBranch}/${path}`,
	};
};

const getN8nDocsTree = async () => {
	const owner = "n8n-io";
	const repo = "n8n-docs";
	const branch = await getDefaultBranch(owner, repo);
	const tree = await getRepoTree(owner, repo, branch);
	return { branch, entries: tree.tree };
};

export const searchOfficialNodes = async (query: string, limit: number) => {
	const { branch, entries } = await getN8nDocsTree();
	const byNodeType = new Map<string, OfficialNodeDoc>();

	for (const entry of entries) {
		if (entry.type !== "blob") continue;
		const node = extractOfficialNodeFromPath(entry.path, branch);
		if (!node) continue;
		if (!byNodeType.has(node.nodeType)) byNodeType.set(node.nodeType, node);
	}

	const all = Array.from(byNodeType.values());
	const normalizedQuery = query.trim().toLowerCase();
	const scored = all
		.map((item) => {
			const score = scoreByQuery(
				`${item.nodeType} ${item.nodeName} ${item.path}`.toLowerCase(),
				normalizedQuery,
			);
			return { item, score };
		})
		.filter(({ score }) => score > 0)
		.sort(
			(a, b) =>
				b.score - a.score || a.item.nodeType.localeCompare(b.item.nodeType),
		)
		.slice(0, limit)
		.map(({ item }) => item);

	return {
		total: all.length,
		results: scored,
	};
};

export const getOfficialNodeDocs = async (node: string) => {
	const { results } = await searchOfficialNodes("", 5000);
	const normalized = normalizeNodeInput(node);
	const exact = results.find(
		(item) => normalizeNodeInput(item.nodeType) === normalized,
	);
	const byName = results.find(
		(item) => item.nodeName.toLowerCase() === normalized || item.nodeName.toLowerCase().includes(normalized),
	);
	const selected = exact ?? byName ?? null;
	if (!selected) return null;
	const markdown = await fetchText(selected.rawUrl);
	return {
		...selected,
		markdown,
	};
};

export const searchN8nDocsPages = async (query: string, limit: number) => {
	const { branch, entries } = await getN8nDocsTree();
	const pages: N8nDocPage[] = entries
		.filter((entry) => entry.type === "blob")
		.map((entry) => entry.path)
		.filter((path) => path.startsWith("docs/") && path.endsWith(".md"))
		.map((path) => ({
			path,
			title: toTitle(path),
			docsUrl: toDocsUrl(path),
			githubUrl: `https://github.com/n8n-io/n8n-docs/blob/${branch}/${path}`,
			rawUrl: `${RAW_GITHUB_BASE}/n8n-io/n8n-docs/${branch}/${path}`,
		}));

	const normalizedQuery = query.trim().toLowerCase();
	const results = pages
		.map((page) => {
			const score = scoreByQuery(
				`${page.path} ${page.title}`.toLowerCase(),
				normalizedQuery,
			);
			return { page, score };
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
		.slice(0, limit)
		.map(({ page }) => page);

	return {
		total: pages.length,
		results,
	};
};

export const getN8nDocsPage = async (pathInput: string) => {
	const normalizedPath = pathInput.replace(/^\/+/, "").replace(/\/+$/, "");
	const path = normalizedPath.startsWith("docs/")
		? normalizedPath
		: `docs/${normalizedPath}`;

	const { branch } = await getN8nDocsTree();
	const rawUrl = `${RAW_GITHUB_BASE}/n8n-io/n8n-docs/${branch}/${path}`;
	const markdown = await fetchText(rawUrl);

	return {
		path,
		title: toTitle(path),
		docsUrl: toDocsUrl(path),
		githubUrl: `https://github.com/n8n-io/n8n-docs/blob/${branch}/${path}`,
		rawUrl,
		markdown,
	};
};

export { GithubApiError };
