// Hash canônico de projeções — JCS / RFC 8785.
// Conserto obrigatório do transplante (Parte 3.2 do guia):
//   antes:  createHash("sha256").update(JSON.stringify(obj))
//   agora:  sha256(jcs(payload))
//
// Sem JCS canônico, `projection_hash` não vale como endereço reconstruível:
// {a,b} e {b,a} produziriam hashes diferentes apesar de serem o mesmo objeto.
//
// Server-only: usa node:crypto (síncrono, igual à fonte). Se algum dia o motor
// precisar rodar no edge runtime, trocar por Web Crypto (subtle.digest, async).

import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

/**
 * Serializa `payload` na forma canônica RFC 8785 (JCS).
 * Lança se o payload não for serializável (ex.: BigInt, ciclos).
 */
export function canonicalString(payload: unknown): string {
  const jcs = canonicalize(payload);
  if (jcs === undefined) {
    throw new Error("canonicalize: payload is not JSON-serializable");
  }
  return jcs;
}

/**
 * Hash canônico de um payload de projeção.
 * Retorna `sha256:<hex>` — o prefixo torna o algoritmo explícito no endereço.
 */
export function projectionHash(payload: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalString(payload)).digest("hex");
}
