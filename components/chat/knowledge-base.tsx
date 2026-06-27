"use client";

import { FileIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteDocumentAction,
  getDocumentsAction,
  uploadDocument,
} from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function KnowledgeBasePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<
    { readonly id: string; readonly filename: string; readonly status: string; readonly createdAt: Date }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await getDocumentsAction();
    setDocuments(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        await uploadDocument(formData);
        await load();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to upload document.");
      } finally {
        setUploading(false);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDocumentAction(id);
      await load();
    },
    [load],
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        accept=".txt,.md,.json,.pdf"
        className="hidden"
        id="kb-upload"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <label htmlFor="kb-upload">
        <Button asChild disabled={uploading} variant="outline">
          <span className="inline-flex items-center gap-2">
            {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            Upload document
          </span>
        </Button>
      </label>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => (
            <li
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
              key={doc.id}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{doc.filename}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-0.5 text-[10px] uppercase",
                    doc.status === "ready" && "bg-green-500/10 text-green-600",
                    doc.status === "error" && "bg-red-500/10 text-red-600",
                    doc.status !== "ready" && doc.status !== "error" && "bg-yellow-500/10 text-yellow-600",
                  )}
                >
                  {doc.status}
                </span>
              </div>
              <Button
                aria-label={`Delete ${doc.filename}`}
                className="size-6 shrink-0"
                onClick={() => void handleDelete(doc.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2Icon className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
