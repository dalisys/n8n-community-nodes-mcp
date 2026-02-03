import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode as encodeToon } from "@toon-format/toon";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
	NpmRegistryError,
	NpmRegistryNotFoundError,
	npmRegistryClient,
	type NpmRegistryPackage,
} from "./lib/npm-registry";
import { normalizeNpmMetadata } from "./lib/npm-metadata";
import { npmSearchClient, NpmSearchError } from "./lib/npm-search";
import { fetchReadme } from "./lib/readme";
import { err, ok } from "./lib/response";
import {
	docsInputSchema,
	getN8nDocsPageInputSchema,
	getOfficialNodeDocsInputSchema,
	listInputSchema,
	searchN8nDocsPagesInputSchema,
	searchOfficialNodesInputSchema,
	searchInputSchema,
} from "./lib/tool-schemas";
import { dedupeListItems, mapSearchResultsToListItems } from "./lib/listing";
import { runSearch } from "./lib/search";
import {
	getN8nDocsPage,
	getOfficialNodeDocs,
	GithubApiError,
	searchN8nDocsPages,
	searchOfficialNodes,
} from "./lib/n8n-official-docs";

const SEARCH_MAX_RESULTS = 10;
const LIST_MAX_RESULTS = 25;

const attachDownloads = async <T extends { package: string }>(
	items: T[],
): Promise<Array<T & { downloadsLastWeek: number | null }>> => {
	const downloads = await Promise.all(
		items.map(async (item) => {
			try {
				const response = await npmRegistryClient.getDownloadsLastWeek(
					item.package,
				);
				return response.downloads;
			} catch {
				return null;
			}
		}),
	);

	return items.map((item, index) => ({
		...item,
		downloadsLastWeek: downloads[index] ?? null,
	}));
};

const createMcpServer = () => {
	const server = new McpServer({
		name: "n8n Community Nodes MCP",
		version: "1.0.0",
	});

	server.registerTool(
		"search",
		{
			description:
				"Search COMMUNITY npm packages (not official built-in n8n nodes). Use search_official_nodes for official nodes. Params: query (string), limit (1–10, default 5).",
			inputSchema: searchInputSchema,
		},
		async ({ query, limit }: z.infer<typeof searchInputSchema>) => {
			const cappedLimit = Math.min(limit, SEARCH_MAX_RESULTS);
			const { results, total, warnings, hadSuccess } = await runSearch({
				query,
				limit: cappedLimit,
			});

			if (!hadSuccess) {
				return err("Failed to fetch search results", {
					code: "upstream_error",
					meta: warnings.length ? { warnings } : undefined,
				});
			}

			const publicResults = results.map(
				({ tags, downloadsLastWeek, ...rest }) => rest,
			);
			const withDownloads = await attachDownloads(publicResults);
			const toon = encodeToon(withDownloads);

			return ok(toon, warnings.length ? { warnings } : undefined);
		},
	);

	server.registerTool(
		"list",
		{
			description:
				"List COMMUNITY npm packages by tag or all n8n tags (not official built-in nodes). Use search_official_nodes for official nodes. Params: tag (string, optional), limit (1–25, default 10).",
			inputSchema: listInputSchema,
		},
		async ({ tag, limit }: z.infer<typeof listInputSchema>) => {
			const cappedLimit = Math.min(limit, LIST_MAX_RESULTS);
			const defaultTags = [
				"n8n-nodes",
				"n8n-community-node-package",
				"n8n-community-node",
			];
			const tags = tag ? [tag] : defaultTags;
			const size = Math.min(cappedLimit, 50);
			const warnings: string[] = [];

			const searches = await Promise.allSettled(
				tags.map((tagValue) =>
					npmSearchClient.search(`keywords:${tagValue}`, size),
				),
			);

			const results = searches.flatMap((result, index) => {
				if (result.status === "fulfilled") {
					return mapSearchResultsToListItems(result.value.objects, tags[index]);
				}

				const tagValue = tags[index];
				if (result.reason instanceof NpmSearchError) {
					warnings.push(
						`Failed to list tag ${tagValue}: ${result.reason.message}`,
					);
				} else {
					warnings.push(`Failed to list tag ${tagValue}: unexpected error`);
				}
				return [];
			});

			if (!results.length) {
				return err("Failed to fetch list results", {
					code: "upstream_error",
					meta: warnings.length ? { warnings } : undefined,
				});
			}

			const merged = dedupeListItems(results);
			const limited = merged.slice(0, cappedLimit);
			const publicResults = limited.map(
				({ tags, downloadsLastWeek, ...rest }) => rest,
			);
			const withDownloads = await attachDownloads(publicResults);
			const toon = encodeToon(withDownloads);

			return ok(toon, warnings.length ? { warnings } : undefined);
		},
	);

	server.registerTool(
		"docs",
		{
			description:
				"Get COMMUNITY npm package metadata/docs (not official built-in n8n docs). Use get_official_node_docs/get_n8n_docs_page for official docs. Params: name (string), includeReadme (boolean, default false).",
			inputSchema: docsInputSchema,
		},
		async ({ name, includeReadme }: z.infer<typeof docsInputSchema>) => {
			if (!name) return err("Package name is required", { code: "bad_request" });

			let registry: NpmRegistryPackage;
			try {
				registry = await npmRegistryClient.getPackage(name);
			} catch (error) {
				if (error instanceof NpmRegistryNotFoundError) {
					return err(`Package not found: ${name}`, { code: "not_found" });
				}

				const message =
					error instanceof NpmRegistryError
						? `Registry request failed for ${name}`
						: "Unexpected error fetching npm metadata";
				return err(message, { code: "upstream_error" });
			}

			let downloads = null;
			const warnings: string[] = [];
			try {
				downloads = await npmRegistryClient.getDownloadsLastWeek(name);
			} catch {
				warnings.push(
					"Failed to fetch download stats; returning metadata without downloads.",
				);
			}

			const metadata = normalizeNpmMetadata(registry, downloads);
			const summary = {
				name: metadata.name,
				version: metadata.version,
				description: metadata.description,
				homepage: metadata.homepage,
				repositoryUrl: metadata.repositoryUrl,
			};

			let readmeContent: string | null = null;
			let readmeIncluded = false;
			if (includeReadme) {
				try {
					readmeContent = await fetchReadme({
						registry,
						repositoryUrl: metadata.repositoryUrl,
						repositoryDirectory: metadata.repositoryDirectory,
					});
					readmeIncluded = Boolean(readmeContent);
					if (!readmeIncluded) {
						warnings.push("README not found via registry or repository fallback.");
					}
				} catch {
					readmeIncluded = false;
					warnings.push("Failed to fetch README; returning metadata without README.");
				}
			}

			const data = includeReadme
				? {
						...summary,
						readmeIncluded,
						...(readmeIncluded && readmeContent ? { readme: readmeContent } : {}),
					}
				: { ...summary, readmeIncluded: false };

			const toon = encodeToon(data);

			return ok(toon, warnings.length ? { warnings } : undefined);
		},
	);

	server.registerTool(
		"search_official_nodes",
		{
			description:
				"Search official n8n nodes from n8n docs. Params: query (optional), limit (1–30, default 10).",
			inputSchema: searchOfficialNodesInputSchema,
		},
		async ({ query, limit }: z.infer<typeof searchOfficialNodesInputSchema>) => {
			try {
				const data = await searchOfficialNodes(query, limit);
				const toon = encodeToon(data);
				return ok(toon);
			} catch (error) {
				const message =
					error instanceof GithubApiError
						? "Failed to fetch official n8n node catalog from GitHub."
						: "Unexpected error while searching official n8n nodes.";
				return err(message, { code: "upstream_error" });
			}
		},
	);

	server.registerTool(
		"get_official_node_docs",
		{
			description:
				"Get OFFICIAL built-in n8n node docs markdown from n8n docs repo (not community npm README docs). Params: node (required), includeContent (default true).",
			inputSchema: getOfficialNodeDocsInputSchema,
		},
		async ({
			node,
			includeContent,
		}: z.infer<typeof getOfficialNodeDocsInputSchema>) => {
			try {
				const data = await getOfficialNodeDocs(node);
				if (!data) {
					return err(`Official node docs not found for: ${node}`, {
						code: "not_found",
					});
				}
				const responseData = includeContent
					? data
					: {
							nodeType: data.nodeType,
							nodeName: data.nodeName,
							packageName: data.packageName,
							path: data.path,
							docsUrl: data.docsUrl,
							githubUrl: data.githubUrl,
							rawUrl: data.rawUrl,
						};
				const toon = encodeToon(responseData);
				return ok(toon);
			} catch (error) {
				const message =
					error instanceof GithubApiError
						? "Failed to fetch official node documentation from GitHub."
						: "Unexpected error while fetching official node docs.";
				return err(message, { code: "upstream_error" });
			}
		},
	);

	server.registerTool(
		"search_n8n_docs_pages",
		{
			description:
				"Search OFFICIAL n8n documentation pages (docs.n8n.io content from n8n-io/n8n-docs). Params: query (required), limit (1–30, default 10).",
			inputSchema: searchN8nDocsPagesInputSchema,
		},
		async ({
			query,
			limit,
		}: z.infer<typeof searchN8nDocsPagesInputSchema>) => {
			try {
				const data = await searchN8nDocsPages(query, limit);
				const toon = encodeToon(data);
				return ok(toon);
			} catch (error) {
				const message =
					error instanceof GithubApiError
						? "Failed to search n8n docs pages from GitHub."
						: "Unexpected error while searching n8n docs pages.";
				return err(message, { code: "upstream_error" });
			}
		},
	);

	server.registerTool(
		"get_n8n_docs_page",
		{
			description:
				"Get full OFFICIAL n8n docs page markdown by path from n8n-io/n8n-docs. Param: path (e.g., docs/integrations/builtin/core-nodes/n8n-nodes-base.code.md).",
			inputSchema: getN8nDocsPageInputSchema,
		},
		async ({ path }: z.infer<typeof getN8nDocsPageInputSchema>) => {
			try {
				const data = await getN8nDocsPage(path);
				const toon = encodeToon(data);
				return ok(toon);
			} catch (error) {
				const message =
					error instanceof GithubApiError
						? "Failed to fetch n8n docs page from GitHub."
						: "Unexpected error while fetching n8n docs page.";
				return err(message, { code: "upstream_error" });
			}
		},
	);

	return server;
};

type TransportEntry = {
	transport: StreamableHTTPServerTransport;
	server: McpServer;
};

const transports = new Map<string, TransportEntry>();

const app = Fastify({ logger: false });

app.post("/mcp", async (request, reply) => {
	reply.hijack();
	const sessionId = request.headers["mcp-session-id"] as string | undefined;

	try {
		if (sessionId && transports.has(sessionId)) {
			const entry = transports.get(sessionId);
			if (!entry) {
				reply.code(400).send({
					jsonrpc: "2.0",
					error: { code: -32000, message: "Invalid session ID" },
					id: null,
				});
				return;
			}
			await entry.transport.handleRequest(
				request.raw,
				reply.raw,
				request.body,
			);
			return;
		}

		if (!sessionId && isInitializeRequest(request.body)) {
			const server = createMcpServer();
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (initializedSessionId) => {
					transports.set(initializedSessionId, { transport, server });
				},
			});

			transport.onclose = () => {
				const activeSession = transport.sessionId;
				if (activeSession && transports.has(activeSession)) {
					transports.delete(activeSession);
				}
				server.close();
			};

			await server.connect(transport);

			await transport.handleRequest(request.raw, reply.raw, request.body);
			return;
		}

		reply.code(400).send({
			jsonrpc: "2.0",
			error: { code: -32000, message: "Bad Request: No valid session ID" },
			id: null,
		});
	} catch (error) {
		if (!reply.raw.headersSent) {
			reply.code(500).send({
				jsonrpc: "2.0",
				error: { code: -32603, message: "Internal server error" },
				id: null,
			});
		}
	}
});

app.get("/mcp", async (request, reply) => {
	reply.hijack();
	const sessionId = request.headers["mcp-session-id"] as string | undefined;
	if (!sessionId || !transports.has(sessionId)) {
		reply.code(400).send("Invalid or missing session ID");
		return;
	}
	const entry = transports.get(sessionId);
	if (!entry) {
		reply.code(400).send("Invalid or missing session ID");
		return;
	}
	try {
		await entry.transport.handleRequest(request.raw, reply.raw);
	} catch {
		if (!reply.raw.headersSent) {
			reply.code(500).send("Error processing request");
		}
	}
});

app.delete("/mcp", async (request, reply) => {
	reply.hijack();
	const sessionId = request.headers["mcp-session-id"] as string | undefined;
	if (!sessionId || !transports.has(sessionId)) {
		reply.code(400).send("Invalid or missing session ID");
		return;
	}
	const entry = transports.get(sessionId);
	if (!entry) {
		reply.code(400).send("Invalid or missing session ID");
		return;
	}
	try {
		await entry.transport.handleRequest(request.raw, reply.raw);
	} catch {
		if (!reply.raw.headersSent) {
			reply.code(500).send("Error processing request");
		}
	}
});

const host = process.env.MCP_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_PORT ?? "3333");

app.listen({ host, port }).catch((error) => {
	app.log.error(error);
	process.exit(1);
});
