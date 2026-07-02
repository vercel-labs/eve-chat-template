import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { resolveLab } from "@/lib/lab/registry";
import { logToolCall } from "@/lib/db/audit";

// Consequência via airlock (item 13). É o oposto de build_projection: percepção
// nunca muta; ISTO propõe um efeito para o Lab admitir. `needsApproval: always()`
// é o airlock NATIVO do eve — o turno pausa e o humano aprova antes de qualquer
// despacho. Cite o projection_hash que embasou a conclusão (source_projection_hash).

export default defineTool({
  description:
    "Propõe um efeito (uma consequência) para o Lab admitir. Use SOMENTE quando uma conclusão exige agir sobre o mundo/ledger — percepção (build_projection) nunca faz isso. Pausa para aprovação humana (airlock) antes de despachar qualquer coisa. Mapeia uma proposal do bundle de projeção para uma intenção de efeito.",
  inputSchema: z.object({
    intent: z
      .string()
      .min(1)
      .describe("A intenção do efeito, ex.: request_human_approval, create_process, register_act."),
    reason: z.string().optional().describe("Por que este efeito é necessário."),
    effect_class: z
      .enum(["none", "reversible", "compensable", "irreversible"])
      .describe("Reversibilidade do efeito; guia o rigor da admissão pelo Lab."),
    args: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Parâmetros do efeito (ex.: targets de uma proposal)."),
    source_projection_hash: z
      .string()
      .optional()
      .describe("O projection_hash em que esta conclusão se baseia (proveniência)."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const userId = ctx.session.auth.current?.principalId;
    const lab = resolveLab();
    const result = await lab.admit({ ...input, userId });
    const payload = { ok: result.dispatched, intent: input.intent, ...result };

    if (userId) {
      try { await logToolCall(userId, "propose_effect", input, payload); } catch {}
    }

    return payload;
  },
});
