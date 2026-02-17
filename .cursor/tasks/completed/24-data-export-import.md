# Step 24 — Data Export & Import (Volume Snapshots)

## Goal

Enable users to export and import the actual data stored by their apps — not just configuration (which Step 23 handles), but the persistent volume data (databases, file stores, etc.). Combined with workspace backup/restore, this makes a user's entire setup fully portable across clusters and servers.

## Prerequisites

- Step 23 completed (Backup & Restore for workspace config)

## What to Build

### 1. Per-Service Data Export

Each recipe type needs a data export strategy:

- **PostgreSQL**: `pg_dump` to produce a SQL dump file
- **Redis**: `BGSAVE` + export the RDB file, or use `redis-cli --rdb`
- **MinIO**: Tar/archive the object store data directory
- **n8n**: SQLite export or PostgreSQL dump (depends on n8n's backing DB)
- **Uptime Kuma**: SQLite database export
- **Generic PVC**: Raw tar of the volume contents as fallback

### 2. Recipe-Level Export/Import Hooks

Extend `RecipeDefinition` with optional data export/import methods:

```typescript
interface RecipeDefinition<TConfig> {
  // ... existing fields ...

  /** Export app data (database dump, file archive, etc.) */
  exportData?(ctx: DataExportContext<TConfig>): Promise<ReadableStream | Buffer>;

  /** Import app data from a previous export */
  importData?(ctx: DataImportContext<TConfig>, data: ReadableStream | Buffer): Promise<void>;

  /** Human-readable description of what data will be exported */
  dataExportDescription?: string;
}
```

### 3. Data Export API

**`POST /api/deployments/:id/export-data`**

- Auth required
- Triggers the recipe's `exportData()` method
- Streams the result back as a downloadable file
- Content-Type depends on recipe (application/sql, application/gzip, etc.)

### 4. Data Import API

**`POST /api/deployments/:id/import-data`**

- Auth required
- Accepts multipart file upload
- Validates the service is running
- Triggers the recipe's `importData()` method
- May need to restart the service after import

### 5. Full Migration Flow

Combine with Step 23's workspace backup:

1. User clicks "Export Everything" → downloads workspace snapshot + data archives for each service
2. On new server: user uploads workspace snapshot → services are recreated
3. User uploads data archives per service → data is restored
4. Result: complete server migration with zero data loss

### 6. UI

- "Export Data" button on each app's detail page (only for apps that support it)
- "Import Data" button (file upload) on each app's detail page
- "Export Everything" button in workspace settings (bundles config + all data)

### 7. Agent Tools

- `exportAppData` — triggers data export for a specific app
- `importAppData` — imports data into a specific app

## Key Challenges

- **Size**: Database dumps can be large. Need streaming, progress indication, and possibly background jobs.
- **Consistency**: For databases, may need to briefly pause writes or use consistent snapshot mechanisms.
- **Format**: Each recipe type has its own export format. Need clear metadata so imports match.
- **Running state**: Some exports require the service to be running (pg_dump), others work on stopped services (raw PVC copy).
- **kubectl exec**: For kind/local clusters, data export likely uses `kubectl exec` to run dump commands inside pods.

## Testing

- [ ] Export PostgreSQL data → valid SQL dump
- [ ] Import PostgreSQL data into fresh instance → data restored
- [ ] Export Redis data → valid RDB/dump
- [ ] Export MinIO data → valid archive
- [ ] Full migration: export workspace + data → new workspace → import all → verify data integrity
- [ ] Large dataset handling (streaming, no OOM)
- [ ] Agent tools work via chat

## Notes

- This is a follow-up to Step 23 (config backup/restore). Step 23 handles the "shape" of the workspace; this step handles the "content."
- Start with PostgreSQL since it's the most common and has well-established dump/restore tooling.
- Consider a `.mathison-backup` archive format that bundles the workspace snapshot JSON + data archives in a single ZIP/tar file for the "Export Everything" flow.
