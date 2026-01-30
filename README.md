# n8n Community MCP Server

A public MCP endpoint for the **n8n community nodes** catalog.

- Website: https://n8n-community-mcp.masmoudi.dev
- MCP endpoint: https://n8n-community-mcp.masmoudi.dev/mcp

## Quick setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

### Claude Code

```bash
claude mcp add --transport http n8n-community https://n8n-community-mcp.masmoudi.dev/mcp
```

### Cursor

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "n8n-community": {
      "url": "https://n8n-community-mcp.masmoudi.dev/mcp"
    }
  }
}
```

### Codex

Add to your `~/.codex/config.toml`:

```toml
[mcp_servers.n8n-community]
url = "https://n8n-community-mcp.masmoudi.dev/mcp"
```

### OpenCode

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "n8n-community": {
      "type": "remote",
      "url": "https://n8n-community-mcp.masmoudi.dev/mcp"
    }
  }
}
```

### Antigravity

Add to your `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "n8n-community": {
      "serverUrl": "https://n8n-community-mcp.masmoudi.dev/mcp"
    }
  }
}
```