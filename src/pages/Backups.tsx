// PLAN 8.5/8.6 built POST/GET /api/backup and POST /api/backup/restore with
// no frontend page at all — reachable only by curl. 16.2 added an off-install
// mirror; 16.3 is this screen, showing the mirror's health (not just backups)
// so a broken mirror doesn't sit unnoticed the way PLAN.md's Phase 16 intro
// warns about.
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { TableRowState, BlockState } from "../components/QueryState"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DatabaseBackup, ShieldCheck, ShieldAlert, ShieldQuestion, RotateCcw, FolderOpen } from "lucide-react"

// PLAN 16.4: the only bridge electron/preload.cjs exposes today.
declare global {
  interface Window {
    cscms?: { pickFolder: () => Promise<string | null> }
  }
}

type Backup = { filename: string; size_bytes: number; created_at: string }
type MirrorHealth = {
  dir: string
  ok: boolean | null
  error: string | null
  last_checked_at: string | null
  last_success_at: string | null
}
type MirrorLocation = { dir: string; configured: string | null; default: string }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const columns = ["Filename", "Created", "Size", ""]

export default function Backups() {
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.backups,
    queryFn: () => api.get<{ items: Backup[]; mirror: MirrorHealth }>("/backup"),
  })
  const items = data?.items ?? []
  const mirror = data?.mirror
  const mirrorState = !mirror || mirror.ok === null ? "unknown" : mirror.ok ? "healthy" : "failed"

  const { data: location } = useQuery({
    queryKey: queryKeys.backupMirrorLocation,
    queryFn: () => api.get<MirrorLocation>("/backup/mirror-location"),
  })
  // null = not yet seeded from the fetched setting; seeded once below so a
  // background refetch doesn't overwrite what the operator is typing.
  const [locationInput, setLocationInput] = useState<string | null>(null)
  useEffect(() => {
    if (location && locationInput === null) setLocationInput(location.configured ?? "")
  }, [location, locationInput])

  const setLocationMutation = useMutation({
    mutationFn: (dir: string) => api.patch<MirrorLocation>("/backup/mirror-location", { dir: dir.trim() || null }),
    onSuccess: result => {
      queryClient.setQueryData(queryKeys.backupMirrorLocation, result)
      setLocationInput(result.configured ?? "")
    },
  })

  async function browseForMirrorFolder() {
    const picked = await window.cscms?.pickFolder()
    if (picked) setLocationInput(picked)
  }

  const backupNowMutation = useMutation({
    mutationFn: () => api.post("/backup"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.backups }),
  })

  const restoreMutation = useMutation({
    mutationFn: (filename: string) => api.post("/backup/restore", { filename, confirm: true }),
    // a restore swaps the whole DB out from under every other page, not just
    // this one's data — invalidate everything rather than only queryKeys.backups.
    onSuccess: () => { queryClient.invalidateQueries(); setRestoreTarget(null) },
  })

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Backups</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
            {isLoading ? "Loading…" : error ? "Could not load backups" : `${items.length} backup${items.length === 1 ? "" : "s"} kept`}
          </p>
        </div>
        <Button onClick={() => backupNowMutation.mutate()} disabled={backupNowMutation.isPending}>
          {backupNowMutation.isPending ? "Backing up…" : "Backup Now"}
        </Button>
      </div>

      {backupNowMutation.isError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{(backupNowMutation.error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DatabaseBackup className="size-4" /> Off-Install Mirror
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || error ? (
            <BlockState isLoading={isLoading} error={error} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {mirrorState === "healthy" && <Badge className="bg-success/15 text-success"><ShieldCheck /> Healthy</Badge>}
                {mirrorState === "failed" && <Badge className="bg-destructive/15 text-destructive"><ShieldAlert /> Failed</Badge>}
                {mirrorState === "unknown" && <Badge variant="outline"><ShieldQuestion /> Not yet checked</Badge>}
                <span className="font-mono text-xs break-all text-muted-foreground">{mirror?.dir}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>Last successful write: <span className="text-foreground">{mirror?.last_success_at ?? "never"}</span></div>
                <div>Last checked: <span className="text-foreground">{mirror?.last_checked_at ?? "never"}</span></div>
              </div>
              {mirrorState === "failed" && mirror?.error && (
                <Alert variant="destructive">
                  <AlertDescription>{mirror.error}</AlertDescription>
                </Alert>
              )}

              <div className="border-t pt-3">
                <div className="mb-1.5 text-xs font-medium">Mirror location</div>
                <div className="flex gap-2">
                  <Input
                    value={locationInput ?? ""}
                    onChange={e => setLocationInput(e.target.value)}
                    placeholder={location?.default ?? "Loading…"}
                    className="font-mono text-xs"
                  />
                  {window.cscms && (
                    <Button variant="outline" onClick={browseForMirrorFolder} type="button">
                      <FolderOpen /> Browse…
                    </Button>
                  )}
                  <Button
                    onClick={() => locationInput !== null && setLocationMutation.mutate(locationInput)}
                    disabled={setLocationMutation.isPending || locationInput === null}
                  >
                    Save
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  A second drive, USB stick, or an existing OneDrive/Google Drive folder. Leave blank to use the default: <span className="font-mono">{location?.default}</span>
                </p>
                {setLocationMutation.isError && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertDescription>{(setLocationMutation.error as Error).message}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Size</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={isLoading} error={error} colSpan={columns.length} />
            {!isLoading && !error && items.map(b => (
              <TableRow key={b.filename}>
                <TableCell className="font-mono text-xs">{b.filename}</TableCell>
                <TableCell className="text-muted-foreground">{b.created_at}</TableCell>
                <TableCell className="font-mono tabular-nums">{formatBytes(b.size_bytes)}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setRestoreTarget(b.filename)}>
                    <RotateCcw /> Restore
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !error && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No backups yet</EmptyTitle>
                      <EmptyDescription>Backups are taken automatically when CSCMS closes, or on demand with "Backup Now".</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {restoreMutation.isError && (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{(restoreMutation.error as Error).message}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={restoreTarget !== null} onOpenChange={open => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {restoreTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the live database with this backup. A safety copy of the current database is taken first, but everything recorded since this backup was made will be gone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
