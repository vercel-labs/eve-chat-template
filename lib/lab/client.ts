import { resolveLab } from "./registry";
import type { EffectIntent, EffectDispatchResult } from "./types";

/** Backward-compat re-export: delegates to the provider registry. */
export async function dispatchEffect(intent: EffectIntent): Promise<EffectDispatchResult> {
  const lab = resolveLab();
  return lab.admit(intent);
}

export type { EffectIntent, EffectDispatchResult } from "./types";
