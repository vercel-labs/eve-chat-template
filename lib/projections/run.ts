// Runner compartilhado das tools de projeção.
// Junta engine + reader + store + tratamento de erro num único ponto, pra
// build_projection e navigate_projection ficarem finas. A invariante read-only
// (Parte 2.3 do guia) viaja no resultado como `cannot_do`: a Scene inspeciona,
// mas nunca registra, despacha ou muta ledger.
//
// O engine (assembleScene) continua puro/sem persistência. É AQUI, na camada de
// integração, que a custódia entra: toda projeção gerada é persistida, e
// scene.back reabre o parent EXATO por hash em vez de recalcular (item 6).

import { assembleScene } from "./engine";
import { createSceneReaders } from "./readers";
import { SceneOpNotImplementedError } from "./errors";
import type { SceneRequest, SceneResponse } from "./scene-types";
import { drizzleProjectionStore, type ProjectionStore } from "@/lib/db/projections";

export const PROJECTION_CANNOT_DO = [
  "register_receipt",
  "dispatch_effect",
  "mutate_ledger",
  "authorize_L5",
] as const;

export type ProjectionToolResult =
  | { ok: true; scene: SceneResponse; reopened?: boolean; cannot_do: string[] }
  | {
      ok: false;
      reason: "projection_unavailable";
      errors: Array<{ field: string; message: string }>;
      cannot_do: string[];
    };

function ok(scene: SceneResponse, reopened = false): ProjectionToolResult {
  return { ok: true, scene, ...(reopened ? { reopened: true } : {}), cannot_do: [...PROJECTION_CANNOT_DO] };
}

export async function runProjection(
  req: SceneRequest,
  store: ProjectionStore = drizzleProjectionStore,
): Promise<ProjectionToolResult> {
  // back por hash: reabre o parent exato persistido, sem recálculo. Se o store
  // estiver indisponível ou não tiver a projeção, cai para o caminho normal.
  if (req.op === "scene.back" && req.parent_projection_hash) {
    try {
      const stored = await store.get(req.parent_projection_hash);
      if (stored) return ok(stored, true);
    } catch {
      // store indisponível → recalcula
    }
  }

  try {
    const scene = await assembleScene(req, createSceneReaders(), { now: Date.now() });
    // persist best-effort: falha de custódia não quebra a leitura.
    try {
      await store.put(scene);
    } catch {
      // store indisponível → segue só com a leitura
    }
    return ok(scene);
  } catch (err) {
    if (err instanceof SceneOpNotImplementedError) {
      return {
        ok: false,
        reason: "projection_unavailable",
        errors: [{ field: "op", message: err.message }],
        cannot_do: [err.op, ...PROJECTION_CANNOT_DO],
      };
    }
    return {
      ok: false,
      reason: "projection_unavailable",
      errors: [{ field: "runtime", message: err instanceof Error ? err.message : String(err) }],
      cannot_do: [...PROJECTION_CANNOT_DO],
    };
  }
}
