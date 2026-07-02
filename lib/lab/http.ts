import type { LabProvider, EffectIntent, EffectDispatchResult } from "./types";

const DEFAULT_TIMEOUT_MS = 8000;

export function resolveLabUrl(): string | undefined {
  return process.env.DREAM_MACHINE_LAB_URL?.trim() || undefined;
}

export const httpLab: LabProvider = {
  id: "http",
  async admit(intent: EffectIntent): Promise<EffectDispatchResult> {
    const baseUrl = resolveLabUrl();
    if (!baseUrl) {
      return {
        dispatched: false,
        provider: "http",
        reason: "Lab seam não configurado (DREAM_MACHINE_LAB_URL ausente); intenção aprovada mas não despachada.",
      };
    }

    const token = process.env.DREAM_MACHINE_LAB_TOKEN?.trim();
    const url = `${baseUrl.replace(/\/+$/, "")}/effect`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.DREAM_MACHINE_LAB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(intent),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Lab respondeu ${res.status} ${res.statusText}`);
      }
      const receipt = (await res.json()) as unknown;
      return { dispatched: true, provider: "http", receipt };
    } catch (err) {
      return {
        dispatched: false,
        provider: "http",
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
