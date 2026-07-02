import { getAuditLogAction } from "@/app/actions/audit";
import { getDocumentsAction } from "@/app/actions/documents";
import { getTasksAction } from "@/app/actions/tasks";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";
import { redirect } from "next/navigation";

export async function DashboardContent() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    redirect("/");
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    redirect("/");
  }

  const [tasks, documents, auditLog] = await Promise.all([
    getTasksAction(),
    getDocumentsAction(),
    getAuditLogAction(),
  ]);

  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress").length;
  const completedTasks = tasks.filter((task) => task.status === "completed" || task.status === "verified").length;
  const readyDocuments = documents.filter((doc) => doc.status === "ready").length;

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="Open tasks" value={openTasks} />
        <SummaryCard label="Completed tasks" value={completedTasks} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tasks.map((task) => (
              <li className="flex items-center justify-between px-4 py-3" key={task.id}>
                <div>
                  <p className="font-medium">{task.title}</p>
                  {task.description ? (
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  ) : null}
                </div>
                <span className="rounded-full px-2 py-1 text-xs uppercase">{task.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Knowledge base</h2>
        <p className="text-sm text-muted-foreground">
          {documents.length} document{documents.length === 1 ? "" : "s"} uploaded
          {readyDocuments > 0 ? `, ${readyDocuments} ready for search` : ""}.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Audit log</h2>
        {auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tool calls recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {auditLog.map((entry) => (
              <li className="px-4 py-3" key={entry.id}>
                <p className="font-medium">{entry.toolName}</p>
                <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
