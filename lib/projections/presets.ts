// As três projeções iniciais (Parte 4.2 do guia). "Começar pequeno e forte":
// só estas três já mudam a forma como a Eve percebe o Lab.
//
// O motor é guiado por `goal` em linguagem natural — o governor deriva a
// saliência do texto (HINTS pt/en em governor.ts). Estes presets são só goals
// canônicos reutilizáveis (system prompt, botões da UI, schedule diário).

export type ProjectionPreset = {
  kind: string;
  label: string;
  goal: string;
};

export const PROJECTION_PRESETS: ProjectionPreset[] = [
  {
    kind: "attention.field",
    label: "O que importa agora",
    goal: "o que está travado e esperando por mim agora",
  },
  {
    kind: "project.current_state",
    label: "Onde estamos",
    goal: "o estado atual e o que mudou recentemente nos processos",
  },
  {
    kind: "risk.map",
    label: "Onde dói",
    goal: "onde está o risco e o que está escalando",
  },
];
