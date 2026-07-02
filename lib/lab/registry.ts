import type { LabProvider } from "./types";
import { localLab } from "./local";
import { httpLab } from "./http";

const providers = new Map<string, LabProvider>([
  [localLab.id, localLab],
  [httpLab.id, httpLab],
]);

export function registerLabProvider(p: LabProvider) { providers.set(p.id, p); }

export function resolveLab(): LabProvider {
  const explicit = process.env.LAB_PROVIDER;          // plugin id override
  const id = process.env.DREAM_MACHINE_LAB_URL ? "http" : "local";
  return providers.get(explicit ?? id) ?? localLab;
}
