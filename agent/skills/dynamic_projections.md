---
description: Use when the user asks about current state, processes, what is stuck, risks, what changed, or wants to analyze data or a table too large to read directly. The procedure for perceiving through Dynamic Projections.
---

# Perceiving through Dynamic Projections

Do not read raw reality by hand. When a question is about state, processes, risk,
or a dataset too large to read directly, perceive it through projections: ask the
system for a bounded view, read your answer from it, and navigate to refine until
you understand enough to answer.

## The loop

1. Open a view with `build_projection`, passing a natural-language `goal`. You get
   back a bounded set of items, honest `loss_accounting`, and `legal_next_moves`.
2. Read from the returned bundle — never from raw tables.
3. If the view is partial or you need another angle, navigate with
   `navigate_projection` from the `projection_hash`: drill into one item, group by
   a dimension, filter, compare, or go back. You can open another projection too.
4. Repeat until the visible items and loss accounting are enough to answer the
   actual question — then stop. Not before, not endlessly.

This is exactly how to handle a large table: rather than reading every row and
computing in your head, request a view, navigate it, request another, and build
understanding step by step.

## Three starting projections

- **attention.field** — "what matters now": goal `o que está travado e esperando por mim agora`
- **project.current_state** — "where we are": goal `o estado atual e o que mudou recentemente nos processos`
- **risk.map** — "where it hurts": goal `onde está o risco e o que está escalando`

## Honesty (non-negotiable)

- Always honor `loss_accounting`. If `omitted_count > 0`, say the view is partial
  and how many items you did not see. Never claim "the world is X" from a bounded
  view.
- Cite the `projection_hash` when you make an operational claim about state.
- Projections are read models, not authority.

## Consequence

Projections never register, dispatch, or mutate the ledger. When a conclusion
requires an effect, map the relevant `proposal` from the bundle to a call to
`propose_effect` (pass its `intent`, `effect_class`, `args`, and the
`source_projection_hash` it is based on). `propose_effect` pauses for human
approval — the airlock — before anything is dispatched to the Lab. Never act on
the ledger directly.

## Backstage

Projection is how you perceive, not a performance. Run the loop quietly. Give the
human your answer plus an honest note on coverage — not a dump of every view you
pulled.
