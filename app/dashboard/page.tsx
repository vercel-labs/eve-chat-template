import { Suspense } from "react";
import { DashboardContent } from "./dashboard-content";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      <Suspense
        fallback={
          <div className="space-y-8">
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </div>
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="rounded-md border p-4">
      <div className="mb-2 h-4 w-24 rounded bg-muted" />
      <div className="h-8 w-16 rounded bg-muted" />
    </div>
  );
}

function SectionSkeleton() {
  return (
    <section>
      <div className="mb-3 h-5 w-32 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
    </section>
  );
}
