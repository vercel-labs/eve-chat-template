import { defineTool } from "eve/tools";
import { z } from "zod";
import { runProjection } from "@/lib/projections/run";

// Abre a visão (item 8 do transplante). Equivale a `scene.open`: a Eve faz uma
// pergunta (goal) sobre um escopo e recebe um ProcessView ranqueado por
// saliência, com loss accounting honesto e os próximos movimentos legais. Para
// navegar a ladder a partir daqui, use navigate_projection com o projection_hash.

const scopeSchema = z
  .object({
    ledger: z.string().optional(),
    process: z.string().optional(),
    process_id: z.string().optional(),
    content_hash: z.string().optional(),
    stream_id: z.string().optional(),
  })
  .default({})
  .describe("O que a cena observa. Vazio = tudo.");

export default defineTool({
  description:
    "Abre uma Dynamic Projection (read-only) sobre o ledger via o motor Scene. Dê um `goal` em linguagem natural; receba uma view delimitada de processos (estado + andamento), loss accounting honesto e os legal_next_moves para aprofundar. Nunca registra, despacha nem muta ledger — efeitos voltam como proposals para o airlock.",
  inputSchema: z.object({
    goal: z
      .string()
      .optional()
      .describe("Objetivo em linguagem natural; guia a saliência (ex.: 'o que está travado e esperando por mim')."),
    scope: scopeSchema,
    limit: z.number().int().positive().max(50).optional().describe("Máximo de itens na view (default 10)."),
  }),
  async execute({ goal, scope, limit }, ctx) {
    const userId = ctx.session.auth.current?.principalId;
    const scopeWithUser = userId ? { ...scope, stream_id: userId } : scope;
    return runProjection({ op: "scene.open", goal, scope: scopeWithUser, limit });
  },
});
