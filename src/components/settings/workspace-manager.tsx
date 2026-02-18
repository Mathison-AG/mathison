"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Trash2, Loader2, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────

interface Workspace {
  id: string;
  slug: string;
  name: string;
  namespace: string;
  status: string;
  deploymentCount: number;
  createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────

async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await fetch("/api/workspaces");
  if (!res.ok) throw new Error("Failed to fetch workspaces");
  const data = await res.json();
  return data.workspaces;
}

async function createWorkspace(name: string): Promise<Workspace> {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to create workspace");
  }
  return res.json();
}

async function deleteWorkspaceApi(id: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to delete workspace");
  }
}

async function exportWorkspaceApi(id: string, slug: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${id}/export?download=true`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to export workspace");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ImportResult {
  totalQueued: number;
  totalSkipped: number;
  totalErrors: number;
  services: Array<{ name: string; status: string; message?: string }>;
}

async function importWorkspaceApi(
  id: string,
  snapshot: unknown,
  force: boolean
): Promise<ImportResult> {
  const url = force
    ? `/api/workspaces/${id}/import?force=true`
    : `/api/workspaces/${id}/import`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  });
  const data = await res.json();
  if (!res.ok) {
    const details = data.details as
      | Array<{ service: string; error: string }>
      | undefined;
    if (details?.length) {
      throw new Error(
        details.map((d) => `${d.service}: ${d.error}`).join("\n")
      );
    }
    throw new Error(data.error ?? "Failed to import workspace");
  }
  return data as ImportResult;
}

// ─── Component ────────────────────────────────────────────

export function WorkspaceManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backup/restore state
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTargetWs, setImportTargetWs] = useState<Workspace | null>(null);
  const [importForce, setImportForce] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces
  });

  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setNewName("");
      setCreateOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkspaceApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      router.refresh();
    }
  });

  const importMutation = useMutation({
    mutationFn: async ({
      wsId,
      snapshot,
      force
    }: {
      wsId: string;
      snapshot: unknown;
      force: boolean;
    }) => importWorkspaceApi(wsId, snapshot, force),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
      setImportOpen(false);
      setImportFile(null);
      setImportError(null);
      setImportForce(false);
      router.refresh();

      if (result.totalQueued > 0) {
        toast.success(
          `Restoring ${result.totalQueued} app${result.totalQueued !== 1 ? "s" : ""}. This may take a couple of minutes.`
        );
      } else if (result.totalSkipped > 0) {
        toast.info("All apps from the backup already exist.");
      }
      if (result.totalErrors > 0) {
        toast.error(
          `${result.totalErrors} app${result.totalErrors !== 1 ? "s" : ""} failed to restore.`
        );
      }
    },
    onError: (err: Error) => {
      setImportError(err.message);
    }
  });

  function handleCreate() {
    if (!newName.trim()) return;
    setError(null);
    createMutation.mutate(newName.trim());
  }

  async function handleExport(ws: Workspace) {
    setExportingId(ws.id);
    try {
      await exportWorkspaceApi(ws.id, ws.slug);
      toast.success(`Backup downloaded for "${ws.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download backup"
      );
    } finally {
      setExportingId(null);
    }
  }

  function openImportDialog(ws: Workspace) {
    setImportTargetWs(ws);
    setImportFile(null);
    setImportError(null);
    setImportForce(false);
    setImportOpen(true);
  }

  async function handleImport() {
    if (!importFile || !importTargetWs) return;
    setImportError(null);

    try {
      const text = await importFile.text();
      const snapshot: unknown = JSON.parse(text);
      importMutation.mutate({
        wsId: importTargetWs.id,
        snapshot,
        force: importForce
      });
    } catch {
      setImportError(
        "Could not read the file. Make sure it's a valid JSON backup."
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-muted-foreground shrink-0" />
            <div>
              <CardTitle>Workspaces</CardTitle>
              <CardDescription>
                Separate environments for your apps. Each workspace has its own
                set of installed apps.
              </CardDescription>
            </div>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0 w-full sm:w-auto">
                <Plus className="mr-2 size-4" />
                New workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create workspace</DialogTitle>
                <DialogDescription>
                  Create a new workspace to keep your apps organized separately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Name</Label>
                  <Input
                    id="workspace-name"
                    placeholder="e.g. Staging, Production, Testing"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No workspaces found. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{ws.name}</span>
                    <Badge
                      variant={
                        ws.status === "ACTIVE" ? "secondary" : "destructive"
                      }
                      className="shrink-0"
                    >
                      {ws.status.toLowerCase()}
                    </Badge>
                  </div>
                  <code className="block text-xs font-mono text-muted-foreground truncate" title={ws.namespace}>
                    {ws.namespace}
                  </code>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {ws.deploymentCount} app
                      {ws.deploymentCount !== 1 ? "s" : ""}
                    </span>
                    <span className="hidden sm:inline">
                      Created {new Date(ws.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    disabled={exportingId === ws.id || ws.status !== "ACTIVE"}
                    onClick={() => handleExport(ws)}
                    title="Download backup"
                  >
                    {exportingId === ws.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    <span className="sr-only">Download backup</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    disabled={ws.status !== "ACTIVE"}
                    onClick={() => openImportDialog(ws)}
                    title="Restore from backup"
                  >
                    <Upload className="size-4" />
                    <span className="sr-only">Restore from backup</span>
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={
                          deleteMutation.isPending ||
                          ws.status !== "ACTIVE" ||
                          workspaces.filter((w) => w.status === "ACTIVE")
                            .length <= 1
                        }
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete workspace</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete workspace &quot;{ws.name}&quot;?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove the workspace and all{" "}
                          <strong>
                            {ws.deploymentCount} app
                            {ws.deploymentCount !== 1 ? "s" : ""}
                          </strong>{" "}
                          installed in it. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteMutation.mutate(ws.id)}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 size-4" />
                          )}
                          Delete workspace
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Import / Restore dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setImportFile(null);
            setImportError(null);
            setImportForce(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from backup</DialogTitle>
            <DialogDescription>
              Upload a backup file to restore apps into{" "}
              <strong>{importTargetWs?.name}</strong>. New secrets will be
              generated for all apps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="backup-file">Backup file</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 size-4" />
                  {importFile ? importFile.name : "Choose file..."}
                </Button>
                <input
                  ref={fileInputRef}
                  id="backup-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null);
                    setImportError(null);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="import-force"
                type="checkbox"
                className="size-4 rounded border-input"
                checked={importForce}
                onChange={(e) => setImportForce(e.target.checked)}
              />
              <Label htmlFor="import-force" className="text-sm font-normal">
                Replace existing apps with the same name
              </Label>
            </div>

            {importError && (
              <p className="text-sm text-destructive whitespace-pre-wrap">
                {importError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importFile || importMutation.isPending}
            >
              {importMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
