// Dynamic Projection — contrato de custódia (envelope de identidade).
// Transcrição da Parte 4.4 do guia de transplante.
//
// Este é o ENVELOPE em volta de uma projeção: o que a originou (inputRefs),
// como foi montada (transform), o que ela afirma (output) e os hashes que a
// tornam um endereço reconstruível (hashes). NÃO é o output bruto do motor
// Scene — esse (SceneResponse, ProcessView, loss_accounting) chega com o
// engine, no item 3 do transplante.

export type ProjectionInputSource =
  | "ledger"
  | "doc"
  | "task"
  | "chat"
  | "file"
  | "webhook"
  | "audit";

export type InputRef = {
  source: ProjectionInputSource;
  id: string;
  hash?: string;
};

export type TransformEngine = "deterministic" | "llm" | "hybrid";

export type ProjectionTransform = {
  engine: TransformEngine;
  model?: string;
  promptHash?: string;
  codeHash?: string;
  params?: Record<string, unknown>;
};

export type Confidence = "low" | "medium" | "high";

export type Claim = {
  text: string;
  support: string[];
  confidence: Confidence;
};

export type ProjectionScope = {
  entities?: string[];
  projects?: string[];
  timeRange?: { from?: string; to?: string };
  sources: string[];
};

export type ProjectionOutput = {
  summary: string;
  claims: Claim[];
  risks?: string[];
  openQuestions?: string[];
  nextActions?: string[];
};

export type ProjectionHashes = {
  inputHash: string;
  outputHash: string;
  projectionHash: string;
};

export type DynamicProjection = {
  id: string;
  kind: string;
  goal: string;
  scope: ProjectionScope;
  inputRefs: InputRef[];
  transform: ProjectionTransform;
  output: ProjectionOutput;
  hashes: ProjectionHashes;
  ttl?: string;
  createdAt: string;
};
