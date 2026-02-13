import { Grid3X3 } from "lucide-react";

export default function CatalogPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Grid3X3 className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Service Catalog
          </h2>
          <p className="text-muted-foreground">
            Browse and deploy services from the catalog.
          </p>
        </div>
      </div>
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          Catalog UI coming in Step 11
        </p>
      </div>
    </div>
  );
}
