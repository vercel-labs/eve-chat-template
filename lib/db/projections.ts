import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projection } from "@/lib/db/schema";
import type { SceneResponse } from "@/lib/projections/scene-types";

// Registry de Dynamic Projections (item 6). Custódia mínima por projection_hash:
// persiste o SceneResponse inteiro + metadados de ladder, e reabre o parent
// exato por hash. content-addressed → insert idempotente.

export type ProjectionStore = {
  get(hash: string): Promise<SceneResponse | null>;
  put(scene: SceneResponse): Promise<void>;
};

function rootScope(scene: SceneResponse): Record<string, unknown> {
  const filters = scene.view.filters as { scope?: Record<string, unknown> };
  return filters?.scope ?? {};
}

export async function getProjection(hash: string): Promise<SceneResponse | null> {
  const rows = await db
    .select({ body: projection.body })
    .from(projection)
    .where(eq(projection.projectionHash, hash))
    .limit(1);
  return (rows[0]?.body as SceneResponse | undefined) ?? null;
}

export async function storeProjection(scene: SceneResponse, createdBy?: string): Promise<void> {
  // ladder_level = nível do parent + 1 (0 se for raiz). Lookup barato do parent.
  let ladderLevel = 0;
  const parentHash = scene.parent_projection_hashes[0];
  if (parentHash) {
    const parentRows = await db
      .select({ ladderLevel: projection.ladderLevel })
      .from(projection)
      .where(eq(projection.projectionHash, parentHash))
      .limit(1);
    ladderLevel = (parentRows[0]?.ladderLevel ?? 0) + 1;
  }

  await db
    .insert(projection)
    .values({
      projectionHash: scene.projection_hash,
      parentProjectionHashes: scene.parent_projection_hashes,
      ladderLevel,
      goal: scene.goal ?? null,
      op: scene.op,
      scope: rootScope(scene),
      lossAccounting: scene.loss_accounting,
      body: scene,
      createdBy: createdBy ?? null,
    })
    // content-addressed: mesma hash = mesmo conteúdo, nada a atualizar.
    .onConflictDoNothing({ target: projection.projectionHash });
}

/** Store padrão respaldado por Drizzle/Neon. */
export const drizzleProjectionStore: ProjectionStore = {
  get: getProjection,
  put: (scene) => storeProjection(scene),
};
