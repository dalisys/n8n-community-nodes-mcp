import type { McpError, McpResponse, McpResponseMeta } from "./response-types";

type McpTextContent = {
	type: "text";
	text: string;
};

type McpToolResponse = {
	content: McpTextContent[];
};

const toTextContent = (payload: McpResponse<unknown>): McpToolResponse => ({
	content: [{ type: "text", text: JSON.stringify(payload) }],
});

export const ok = <TData>(
	data: TData,
	meta?: McpResponseMeta,
): McpToolResponse => {
	const payload: McpResponse<TData> = meta
		? { ok: true, data, meta }
		: { ok: true, data };
	return toTextContent(payload);
};

export const err = (
	message: string,
	options?: {
		code?: string;
		details?: unknown;
		meta?: McpResponseMeta;
	},
): McpToolResponse => {
	const error: McpError = {
		code: options?.code ?? "unknown_error",
		message,
		details: options?.details,
	};
	const payload: McpResponse<never> = options?.meta
		? { ok: false, error, meta: options.meta }
		: { ok: false, error };
	return toTextContent(payload);
};

export const compact = <TData>(response: McpResponse<TData>): McpToolResponse =>
	toTextContent(response);
