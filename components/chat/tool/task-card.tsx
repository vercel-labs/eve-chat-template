"use client";

// TaskCard — renderização rica das tools de tarefa (create_task, list_tasks,
// complete_task, verify_task). Espelha o visual do ProjectionCard: cabeçalho
// discreto, badges de status e linhas legíveis, no lugar do JSON cru.
//
// Decoplado do tipo EveDynamicToolPart: recebe apenas toolName + output do
// message.tsx, que sabe resolver o nome real da tool.

import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ListTodoIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---- tipos estruturais dos outputs (sem importar server-side) ----

type TaskStatus = "open" | "in_progress" | "completed" | "verified" | string;

type TaskRow = {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly status: TaskStatus;
  readonly assignedTo?: string | null;
  readonly verificationNotes?: string | null;
  readonly createdAt?: string | null;
};

type CreateTaskOutput = {
  readonly created: boolean;
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
};

type ListTasksOutput = { readonly tasks: readonly TaskRow[] };

type CompleteTaskOutput = {
  readonly completed: boolean;
  readonly id: string;
  readonly title?: string;
  readonly status: TaskStatus;
};

type VerifyTaskOutput = {
  readonly id: string;
  readonly status: TaskStatus;
  readonly title: string;
  readonly verified: boolean;
  readonly verificationNotes?: string | null;
};

export const TASK_TOOL_NAMES = new Set([
  "create_task",
  "list_tasks",
  "complete_task",
  "verify_task",
]);

// ---- apresentação de status ----

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  verified: "Verificada",
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  verified: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function statusLabel(status: TaskStatus) {
  return STATUS_LABEL[status] ?? status;
}

function StatusPill({ status }: { readonly status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
        STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

// ---- casca do card ----

function CardShell({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="my-2 w-full overflow-hidden rounded-lg border border-border/70 bg-muted/10 text-sm">
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{title}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5">{children}</div>
    </div>
  );
}

// ---- o card ----

export function TaskCard({
  toolName,
  output,
}: {
  readonly toolName: string;
  readonly output: unknown;
}) {
  if (!output || typeof output !== "object") {
    return null;
  }

  switch (toolName) {
    case "create_task":
      return <CreateTaskCard output={output as CreateTaskOutput} />;
    case "list_tasks":
      return <ListTasksCard output={output as ListTasksOutput} />;
    case "complete_task":
      return <CompleteTaskCard output={output as CompleteTaskOutput} />;
    case "verify_task":
      return <VerifyTaskCard output={output as VerifyTaskOutput} />;
    default:
      return null;
  }
}

function CreateTaskCard({ output }: { readonly output: CreateTaskOutput }) {
  return (
    <CardShell icon={ClipboardListIcon} title="Tarefa criada">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-foreground">{output.title}</span>
        <StatusPill status={output.status} />
      </div>
    </CardShell>
  );
}

function ListTasksCard({ output }: { readonly output: ListTasksOutput }) {
  const tasks = output.tasks ?? [];

  return (
    <CardShell icon={ListTodoIcon} title={`Tarefas (${tasks.length})`}>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma tarefa encontrada.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded border border-border/40 bg-background/40 px-2 py-1.5"
            >
              <div className="flex items-start gap-1.5">
                <span className="min-w-0 flex-1 text-foreground">{task.title}</span>
                <StatusPill status={task.status} />
              </div>
              {task.description ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{task.description}</p>
              ) : null}
              {task.assignedTo ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Responsável: {task.assignedTo}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function CompleteTaskCard({ output }: { readonly output: CompleteTaskOutput }) {
  return (
    <CardShell icon={CheckCircle2Icon} title="Tarefa concluída">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-foreground">
          {output.title ?? "Tarefa atualizada"}
        </span>
        <StatusPill status={output.status} />
      </div>
    </CardShell>
  );
}

function VerifyTaskCard({ output }: { readonly output: VerifyTaskOutput }) {
  return (
    <CardShell icon={output.verified ? ClipboardCheckIcon : CircleDashedIcon} title="Verificação">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-foreground">{output.title}</span>
        <StatusPill status={output.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {output.verified ? "Concluída e verificada." : "Ainda não concluída."}
      </p>
      {output.verificationNotes ? (
        <p className="rounded border border-border/40 bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          {output.verificationNotes}
        </p>
      ) : null}
    </CardShell>
  );
}
