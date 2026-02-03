import { z } from "zod";

export const searchInputSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().min(1).max(10).optional().default(5),
});

export const listInputSchema = z.object({
	tag: z.string().min(1).optional(),
	limit: z.number().int().min(1).max(25).optional().default(10),
});

export const docsInputSchema = z.object({
	name: z.string().min(1),
	includeReadme: z.boolean().optional().default(false),
});

export const searchOfficialNodesInputSchema = z.object({
	query: z.string().optional().default(""),
	limit: z.number().int().min(1).max(30).optional().default(10),
});

export const getOfficialNodeDocsInputSchema = z.object({
	node: z.string().min(1),
	includeContent: z.boolean().optional().default(true),
});

export const searchN8nDocsPagesInputSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().min(1).max(30).optional().default(10),
});

export const getN8nDocsPageInputSchema = z.object({
	path: z.string().min(1),
});
