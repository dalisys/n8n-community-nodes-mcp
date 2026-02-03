export type McpResponseMeta = {
	count?: number;
	page?: number;
	pageSize?: number;
	nextCursor?: string | null;
	warnings?: string[];
	durationMs?: number;
};

export type McpError = {
	code: string;
	message: string;
	details?: unknown;
};

export type McpOkResponse<TData> = {
	ok: true;
	data: TData;
	meta?: McpResponseMeta;
};

export type McpErrorResponse = {
	ok: false;
	error: McpError;
	meta?: McpResponseMeta;
};

export type McpResponse<TData> = McpOkResponse<TData> | McpErrorResponse;
