import type { SceneReaders } from "./types";
import { localSceneReader } from "./local";
import { httpSceneReader } from "./http";

export type ReaderProviderId = "local" | "http" | (string & {});

const providers = new Map<string, () => SceneReaders>([
  ["local", () => localSceneReader],
  ["http", () => httpSceneReader],
]);

/** Plugins register here (e.g. from an init module). Open to the world. */
export function registerSceneReader(id: string, make: () => SceneReaders) {
  providers.set(id, make);
}

export function createSceneReaders(): SceneReaders {
  // Default is local. Setting the runtime URL opts into the external source.
  const id = process.env.DREAM_MACHINE_RUNTIME_URL ? "http" : "local";
  const explicit = process.env.PROJECTION_READER; // optional override / plugin id
  return (providers.get(explicit ?? id) ?? providers.get("local"))!();
}
