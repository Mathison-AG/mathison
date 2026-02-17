"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DataImportButtonProps {
  deploymentId: string;
  appName: string;
  description: string | null;
  disabled?: boolean;
}

export function DataImportButton({
  deploymentId,
  appName,
  description,
  disabled,
}: DataImportButtonProps) {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleImport() {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`/api/deployments/${deploymentId}/import-data`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      toast.success(data.message || `Data imported into ${appName}`);
      setOpen(false);
      setSelectedFile(null);

      // Invalidate queries to refresh the app status
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
      queryClient.invalidateQueries({ queryKey: ["my-apps", deploymentId] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={description ?? `Import data into ${appName}`}
        >
          <Upload className="mr-2 size-4" />
          Import Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Data into {appName}</DialogTitle>
          <DialogDescription>
            {description ??
              "Upload a data file from a previous export to restore your data."}
            {" "}This will overwrite existing data.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <input
            ref={inputRef}
            type="file"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-muted transition-colors"
          />
          {selectedFile && (
            <p className="mt-2 text-sm text-muted-foreground">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
          >
            {isImporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
