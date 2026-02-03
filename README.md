# n8n Community Nodes MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A focused MCP server for:

- **Community n8n packages** from npm
- **Official n8n docs and built-in nodes** from `n8n-io/n8n-docs`

## Recommended (Hosted MCP)

Use the hosted endpoint by default:

- `https://n8n-community-mcp.masmoudi.dev/mcp`

### Quick setup (hosted)

#### Claude Desktop

```json
{
  "mcpServers": {
    "n8n-community": {
      "command": "npx",
      "args": [
        "mcp-remote@latest",
        "--http",
        "https://n8n-community-mcp.masmoudi.dev/mcp",
        "--allow-http"
      ]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add --transport http n8n-community https://n8n-community-mcp.masmoudi.dev/mcp
```

#### Cursor

```json
{
  "mcpServers": {
    "n8n-community": {
      "url": "https://n8n-community-mcp.masmoudi.dev/mcp"
    }
  }
}
```

#### Codex

```toml
[mcp_servers.n8n-community]
url = "https://n8n-community-mcp.masmoudi.dev/mcp"
```

## Tools

### Community npm tools

- `search` → Search **community npm packages only**
- `list` → List **community npm packages only**
- `docs` → Get **community npm package** metadata + optional README

### Official n8n docs tools

- `search_official_nodes` → Search official built-in nodes from `n8n-io/n8n-docs`
- `get_official_node_docs` → Get official node docs markdown
- `search_n8n_docs_pages` → Search official docs pages
- `get_n8n_docs_page` → Get full docs page markdown by path

## Self-host (Optional)

If you want your own instance:

```bash
npm install
npm run build
node dist/index.js
```

Or with an explicit path:

```bash
node /path/to/n8n-community-nodes-mcp/dist/index.js
```

### Environment variables

- `MCP_HOST` (default: `127.0.0.1`)
- `MCP_PORT` (default: `3333`)

Local endpoint:

- `http://127.0.0.1:3333/mcp`

## Local client config (self-hosted)

Use the same client snippets as above, but replace URL with:

- `http://127.0.0.1:3333/mcp`

## Notes

- Official docs data source is GitHub (unauthenticated): `n8n-io/n8n-docs`.
- Example path for `get_n8n_docs_page`:
  - `docs/integrations/builtin/core-nodes/n8n-nodes-base.code.md`

## License

MIT — see `LICENSE`.
