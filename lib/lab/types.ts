import type { EffectClass } from "@/lib/projections/scene-types";

export type EffectIntent = {
  intent: string;
  reason?: string;
  effect_class: EffectClass;
  args?: Record<string, unknown>;
  source_projection_hash?: string;
  userId?: string; // who approved; for local admission + audit
};

export type EffectDispatchResult =
  | { dispatched: true; receipt: unknown; provider: string }
  | { dispatched: false; reason: string; provider: string };

export type LabProvider = {
  id: string;
  admit(intent: EffectIntent): Promise<EffectDispatchResult>;
};
