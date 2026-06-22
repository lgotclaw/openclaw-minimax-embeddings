/**
 * OpenClaw plugin entry: registers the MiniMax memory embedding provider.
 *
 * After installing this plugin, configure memory search to use it:
 *
 *   agents:
 *     defaults:
 *       memorySearch:
 *         provider: "minimax"
 *         model: "embo-01"
 *
 * Auth is the `minimax-portal` OAuth profile (no API key needed).
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { minimaxEmbeddingProviderAdapter } from "./embedding.js";

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-minimax-embeddings",
  name: "MiniMax Embeddings",
  description:
    "Memory embedding provider for MiniMax embo-01, via the existing minimax-portal OAuth profile.",
  register(api) {
    api.registerEmbeddingProvider(minimaxEmbeddingProviderAdapter);
  },
});

export default plugin;
