import { embed, embedMany } from "ai";

// One inference surface, swappable. The default (`gateway`) routes through the
// Vercel AI Gateway on the project's existing credential — the same path the
// agent's inference uses, so there is no separate embedding key. Alternative
// providers are plugins selected via EMBEDDING_PROVIDER.

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

export type EmbeddingProvider = {
  id: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
};

const gatewayProvider: EmbeddingProvider = {
  id: "gateway",
  dimensions: 1536,
  async embed(texts) {
    const values = texts.map((t) => t.trim());
    if (values.length === 1) {
      // A bare provider/model string routes through the AI Gateway on the
      // project's existing credential.
      const { embedding } = await embed({ model: EMBEDDING_MODEL, value: values[0] });
      return [embedding];
    }
    const { embeddings } = await embedMany({ model: EMBEDDING_MODEL, values });
    return embeddings;
  },
};

const googleProvider: EmbeddingProvider = {
  id: "google",
  dimensions: 1536,
  async embed() {
    throw new Error(
      "Google embedding provider not configured. Install @ai-sdk/google and set outputDimensionality: 1536.",
    );
  },
};

const localProvider: EmbeddingProvider = {
  id: "local",
  dimensions: 768,
  async embed() {
    throw new Error(
      "Local embedding provider not configured. Install transformers.js and ensure the vector column matches the model's native dimension.",
    );
  },
};

const providers = new Map<string, EmbeddingProvider>([
  [gatewayProvider.id, gatewayProvider],
  [googleProvider.id, googleProvider],
  [localProvider.id, localProvider],
]);

/** Plugins register here. Open to the world. */
export function registerEmbeddingProvider(p: EmbeddingProvider) {
  providers.set(p.id, p);
}

export function resolveEmbeddingProvider(): EmbeddingProvider {
  const id = process.env.EMBEDDING_PROVIDER ?? "gateway";
  return providers.get(id) ?? gatewayProvider;
}
