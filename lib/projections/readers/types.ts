import type { SceneRawRows, SceneScope } from "../scene-types";

export interface SceneReaders {
  readRows(scope: SceneScope): Promise<SceneRawRows>;
}
