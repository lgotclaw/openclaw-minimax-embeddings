/**
 * MiniMax Embedding Provider Adapter
 *
 * Implements OpenClaw's `EmbeddingProviderAdapter` for MiniMax's `embo-01`
 * model. MiniMax's embeddings API uses non-OpenAI field names (`texts` and
 * `embed_type` instead of `input` and `input_type`), which is why this needs
 * a dedicated adapter rather than reusing the OpenAI-compatible memory
 * adapter.
 *
 * Auth: the adapter is wired to the `minimax-portal` OAuth profile via
 * `authProviderId`. OpenClaw's `resolveApiKeyForProvider` handles the OAuth
 * access token (and auto-refresh via the refresh token) for us.
 */
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import type {
  EmbeddingProviderAdapter,
  EmbeddingProviderCreateOptions,
} from "openclaw/plugin-sdk/embedding-providers";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "embo-01";
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_QUERY_EMBED_TYPE = "query";
const DEFAULT_DOCUMENT_EMBED_TYPE = "db";

/**
 * Map OpenClaw's input type taxonomy to MiniMax's `embed_type` field.
 * MiniMax only supports two values: "query" (for search-time vectors) and
 * "db" (for indexing-time vectors). Everything that isn't a query is treated
 * as a document by default — the safe choice for memory indexing.
 */
function resolveMinimaxEmbedType(
  inputType: EmbeddingProviderCreateOptions["inputType"],
  queryInputType: string | undefined,
  documentInputType: string | undefined,
): "query" | "db" {
  if (inputType === "query") {
    return (queryInputType?.trim() as "query" | "db") || DEFAULT_QUERY_EMBED_TYPE;
  }
  // document, semantic, classification, clustering, and undefined all map to "db"
  return (documentInputType?.trim() as "query" | "db") || DEFAULT_DOCUMENT_EMBED_TYPE;
}

interface MinimaxApiResponse {
  vectors: number[][] | null;
  base_resp: {
    status_code: number;
    status_msg?: string;
  };
}

export const minimaxEmbeddingProviderAdapter: EmbeddingProviderAdapter = {
  id: "minimax",
  defaultModel: DEFAULT_MODEL,
  transport: "remote",
  authProviderId: "minimax-portal",
  create: async (options) => {
    // 1. Resolve baseUrl: explicit override → provider config → default
    const baseUrl =
      options.remote?.baseUrl?.trim() ||
      options.config?.models?.providers?.["minimax-portal"]?.baseUrl?.trim() ||
      DEFAULT_BASE_URL;

    // Normalize: the chat endpoint is /anthropic/v1, embeddings are at /v1.
    // So if we see /anthropic/v1 (or just /anthropic) at the end, swap to /v1.
    const normalizedBaseUrl = baseUrl
      .replace(/\/+$/, "")
      .replace(/\/anthropic\/v1$/, "/v1")
      .replace(/\/anthropic$/, "/v1");

    // 2. Resolve bearer token via the auth system
    let apiKey: string | undefined;
    if (options.remote?.apiKey) {
      // remote.apiKey can be a SecretInput (string or reference); resolveSecretInputString
      // is what OpenClaw uses internally. We accept a plain string for simplicity.
      apiKey = typeof options.remote.apiKey === "string"
        ? options.remote.apiKey
        : undefined;
    }
    if (!apiKey) {
      const resolved = await resolveApiKeyForProvider({
        provider: "minimax-portal",
        cfg: options.config,
        agentDir: options.agentDir,
      });
      apiKey = resolved.apiKey;
    }

    // 3. Build the HTTP embed function
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.remote?.headers ?? {}),
    };

    const callEmbeddings = async (
      texts: string[],
      kind: "query" | "db",
      signal?: AbortSignal,
    ): Promise<number[][]> => {
      if (texts.length === 0) return [];
      const body = JSON.stringify({
        model: options.model,
        texts,
        type: kind,
      });
      const response = await fetch(`${normalizedBaseUrl}/embeddings`, {
        method: "POST",
        headers,
        body,
        signal,
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `minimax embeddings failed (${response.status} ${response.statusText}): ${errorText.slice(0, 500)}`,
        );
      }
      const data = (await response.json()) as MinimaxApiResponse;
      if (data.base_resp?.status_code !== 0) {
        throw new Error(
          `minimax embeddings api error ${data.base_resp?.status_code}: ${data.base_resp?.status_msg ?? "unknown"}`,
        );
      }
      if (!data.vectors || data.vectors.length !== texts.length) {
        throw new Error(
          `minimax embeddings returned ${data.vectors?.length ?? 0} vectors for ${texts.length} inputs`,
        );
      }
      return data.vectors;
    };

    return {
      provider: {
        id: "minimax",
        model: options.model,
        dimensions: DEFAULT_DIMENSIONS,
        embed: async (input, opts) => {
          const kind = resolveMinimaxEmbedType(
            opts?.inputType ?? options.inputType,
            options.queryInputType,
            options.documentInputType,
          );
          const [vec] = await callEmbeddings([input as string], kind, opts?.signal);
          return vec ?? [];
        },
        embedBatch: async (inputs, opts) => {
          const kind = resolveMinimaxEmbedType(
            opts?.inputType ?? options.inputType,
            options.queryInputType,
            options.documentInputType,
          );
          return callEmbeddings(inputs as string[], kind, opts?.signal);
        },
      },
      runtime: {
        id: "minimax",
        cacheKeyData: {
          provider: "minimax",
          model: options.model,
          baseUrl: normalizedBaseUrl,
        },
      },
    };
  },
  formatSetupError: (err) => {
    if (err instanceof Error) {
      if (err.message.includes("No credentials found")) {
        return "MiniMax embeddings requires the `minimax-portal` OAuth profile. Run `openclaw configure` to set it up.";
      }
      if (err.message.includes("authorization")) {
        return "MiniMax embeddings OAuth token is invalid or revoked. Re-run `openclaw configure` to refresh.";
      }
      return `minimax embeddings setup error: ${err.message}`;
    }
    return `minimax embeddings setup error: ${String(err)}`;
  },
};
