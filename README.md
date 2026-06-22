# openclaw-minimax-embeddings

OpenClaw memory embedding provider for **MiniMax** (model `embo-01`), wired to the existing `minimax-portal` OAuth profile. No new API keys required.

## Why

OpenClaw's built-in memory embedding adapters all speak the OpenAI request format (`input` + `input_type`). MiniMax's embeddings API at `https://api.minimax.io/v1/embeddings` requires a different body shape (`texts` + `embed_type`) and the `embed_type` field is mandatory, so it can't be reused as-is. This plugin implements a small adapter that speaks MiniMax's protocol correctly.

Open feature request for upstream support: [openclaw/openclaw#62065](https://github.com/openclaw/openclaw/issues/62065).

## Install

```bash
# from the repo root
openclaw plugins install ./path/to/openclaw-minimax-embeddings
openclaw gateway restart
```

Or via npm once published:

```bash
openclaw plugins install @gotclaw/openclaw-minimax-embeddings
openclaw gateway restart
```

## Configure

Add this to your `openclaw.json`:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "minimax",
        model: "embo-01",
      },
    },
  },
}
```

Optional overrides:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "minimax",
        model: "embo-01",
        // Override the endpoint (default: https://api.minimax.io/v1)
        remote: { baseUrl: "https://api.minimax.io/v1" },
        // Override embed_type values
        queryInputType: "query",
        documentInputType: "db",
      },
    },
  },
}
```

## Auth

The plugin resolves the bearer token through OpenClaw's auth system using the `minimax-portal` OAuth profile. No separate API key is needed — the OAuth `access` token is used directly, and `resolveApiKeyForProvider` handles automatic refresh via the stored `refresh` token before `expires`.

If the OAuth session is missing or revoked, the plugin's `formatSetupError` will return a clear message — re-run `openclaw configure` to repair the profile.

## Verify

```bash
openclaw memory status --deep
openclaw memory index --force
```

## Development

```bash
npm install
npm run build
npm run plugin:validate
```

## License

MIT-0 (public domain dedication, no attribution required).
