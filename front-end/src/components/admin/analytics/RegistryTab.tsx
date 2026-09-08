"use client"

import { useCallback, useMemo, useState } from "react"
import { AlertTriangle, Ban, HelpCircle, Loader2, Pencil, Plus, RefreshCw } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import DataTable from "@/components/common/data-table/DataTable"
import type { AnalyticsDimensionResponse, UnregisteredKeyItem } from "@/types/analytics"

const TYPE_OPTIONS = [
  { label: "String", value: "string" },
  { label: "Number", value: "number" },
  { label: "Integer", value: "integer" },
  { label: "Boolean", value: "boolean" },
  { label: "Select", value: "select" },
  { label: "Multi Select", value: "multi-select" },
]

interface RegistryTabProps {
  entries: AnalyticsDimensionResponse[]
  unregistered: UnregisteredKeyItem[]
  isLoading: boolean
  isLoadingUnregistered: boolean
  requestWithAdminAuth: (path: string, init?: RequestInit) => Promise<unknown>
  onRefresh: () => void
}

export default function RegistryTab({
  entries,
  unregistered,
  isLoading,
  isLoadingUnregistered,
  requestWithAdminAuth,
  onRefresh,
}: RegistryTabProps) {
  const [editEntry, setEditEntry] = useState<AnalyticsDimensionResponse | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [addLabel, setAddLabel] = useState("")
  const [addKey, setAddKey] = useState("")
  const [addType, setAddType] = useState("string")
  const [addGroup, setAddGroup] = useState("")
  const [formError, setFormError] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")

  const activeCount = entries.filter((e) => e.is_active).length
  const inactiveCount = entries.length - activeCount

  const filteredEntries = useMemo(() => {
    if (statusFilter === "active") return entries.filter((e) => e.is_active)
    if (statusFilter === "inactive") return entries.filter((e) => !e.is_active)
    return entries
  }, [entries, statusFilter])

  const handleDeactivate = useCallback(
    async (entry: AnalyticsDimensionResponse) => {
      setIsSubmitting(true)
      try {
        await requestWithAdminAuth(`/api/admin/analytics-dimensions/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !entry.is_active }),
        })
        if (entry.is_active) {
          toast.warning(`"${entry.canonical_key}" has been set as inactive.`)
        } else {
          toast.success(`"${entry.canonical_key}" has been set as active.`)
        }
        onRefresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update entry."
        setFormError(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [requestWithAdminAuth, onRefresh],
  )

  const handleSaveEdit = useCallback(
    async () => {
      if (!editEntry) return
      setIsSubmitting(true)
      setFormError("")
      try {
        await requestWithAdminAuth(`/api/admin/analytics-dimensions/${editEntry.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: editEntry.label,
            field_type: editEntry.field_type,
            analytics_group: editEntry.analytics_group,
          }),
        })
        setEditEntry(null)
        toast.success(`"${editEntry.canonical_key}" has been updated.`)
        onRefresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save changes."
        setFormError(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [editEntry, requestWithAdminAuth, onRefresh],
  )

  const handleAdd = useCallback(async () => {
    if (!addLabel.trim() || !addKey.trim()) {
      setFormError("Label and canonical key are required.")
      return
    }
    setIsSubmitting(true)
    setFormError("")
    try {
      await requestWithAdminAuth("/api/admin/analytics-dimensions", {
        method: "POST",
        body: JSON.stringify({
          canonical_key: addKey.trim(),
          label: addLabel.trim(),
          field_type: addType,
          analytics_group: addGroup.trim() || null,
        }),
      })
      setShowAddDialog(false)
      setAddLabel("")
      setAddKey("")
      setAddType("string")
      setAddGroup("")
      toast.success(`"${addKey.trim()}" has been registered.`)
      onRefresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add key."
      setFormError(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [addLabel, addKey, addType, addGroup, requestWithAdminAuth, onRefresh])

  const openAddFromUnregistered = useCallback((item: UnregisteredKeyItem) => {
    setAddKey(item.canonical_key)
    setAddLabel(item.field_label)
    setAddType("string")
    setAddGroup("")
    setFormError("")
    setShowAddDialog(true)
  }, [])

  const columns = useMemo<ColumnDef<AnalyticsDimensionResponse>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Label",
        cell: ({ row }) => (
          <span className={row.original.is_active ? "font-medium" : "text-muted-foreground line-through"}>
            {row.getValue("label")}
          </span>
        ),
      },
      {
        accessorKey: "canonical_key",
        header: "Key",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">{row.getValue("canonical_key")}</span>
        ),
      },
      {
        accessorKey: "field_type",
        header: "Type",
        cell: ({ row }) => {
          const raw = row.getValue("field_type") as string
          const option = TYPE_OPTIONS.find((o) => o.value === raw)
          return <span className="text-xs text-muted-foreground">{option?.label ?? raw}</span>
        },
      },
      {
        accessorKey: "analytics_group",
        header: "Group",
        cell: ({ row }) => {
          const val = row.getValue("analytics_group") as string | null
          return val ? (
            <Badge variant="outline" className="text-xs">{val}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Active</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Inactive</Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setFormError("")
                setEditEntry(row.original)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleDeactivate(row.original)}
              disabled={isSubmitting}
            >
              {row.original.is_active ? (
                <Ban className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
              )}
            </Button>
          </div>
        ),
      },
    ],
    [handleDeactivate, isSubmitting],
  )

  const groupOptions = useMemo(() => {
    const groups = new Set<string>()
    for (const e of entries) {
      if (e.analytics_group) groups.add(e.analytics_group)
    }
    return Array.from(groups).sort().map((g) => ({ label: g, value: g }))
  }, [entries])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading registry...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Unregistered keys banner */}
      {!isLoadingUnregistered && unregistered.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {unregistered.length} unregistered key{unregistered.length !== 1 ? "s" : ""} found in schemas
          </div>
          <div className="space-y-1.5">
            {unregistered.map((item) => (
              <div
                key={`${item.canonical_key}-${item.schema_name}`}
                className="flex items-center justify-between rounded-md border border-amber-100 bg-white px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-700">{item.canonical_key}</span>
                  <span className="text-xs text-muted-foreground">
                    in {item.schema_name} ({item.school_year_name})
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 gap-1 text-xs text-primary"
                  onClick={() => openAddFromUnregistered(item)}
                >
                  <Plus className="h-3 w-3" /> Register
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats + Add button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("inactive")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
              statusFilter === "inactive"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Inactive ({inactiveCount})
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setFormError(""); setShowAddDialog(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Key
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground transition-colors hover:text-foreground">
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Manage the canonical keys used in analytics reports. Active keys provide curated
                labels and groups in the Snapshot, Trends, and Alignment tabs and appear in the
                Trends key list. Inactive keys lose the curated label and group (fields still appear
                with their schema labels) but can be reactivated at any time.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Registry table */}
      <DataTable
        data={filteredEntries}
        columns={columns}
        searchColumn="label"
        searchPlaceholder="Search by label..."
        filterColumn="analytics_group"
        filterOptions={[{ label: "All Groups", value: "all" }, ...groupOptions]}
        mobileCard={(row) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-start justify-between">
              <span className={row.is_active ? "font-medium" : "text-muted-foreground line-through"}>
                {row.label}
              </span>
              {row.is_active ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Active</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Inactive</Badge>
              )}
            </div>
            <p className="font-mono text-xs text-slate-500">{row.canonical_key}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{row.field_type}</span>
              {row.analytics_group && (
                <>
                  <span>&middot;</span>
                  <Badge variant="outline" className="text-xs">{row.analytics_group}</Badge>
                </>
              )}
            </div>
          </div>
        )}
      />

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Registry Entry</DialogTitle>
            <DialogDescription>Update the curated label, type, and group.</DialogDescription>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Label</label>
                <Input
                  value={editEntry.label}
                  onChange={(e) => setEditEntry({ ...editEntry, label: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Canonical Key</label>
                <Input value={editEntry.canonical_key} readOnly className="h-9 font-mono bg-muted/50" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select
                  value={editEntry.field_type}
                  onValueChange={(v) => setEditEntry({ ...editEntry, field_type: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Group</label>
                <Input
                  value={editEntry.analytics_group ?? ""}
                  onChange={(e) => setEditEntry({ ...editEntry, analytics_group: e.target.value || null })}
                  className="h-9"
                  placeholder="e.g. Demographics"
                />
              </div>
            </div>
          )}
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditEntry(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) setShowAddDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Registry Key</DialogTitle>
            <DialogDescription>Create a new canonical key in the analytics registry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <Input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="h-9"
                placeholder="e.g. Religious Affiliation"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Canonical Key</label>
              <Input
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                className="h-9 font-mono"
                placeholder="e.g. religion"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Group</label>
              <Input
                value={addGroup}
                onChange={(e) => setAddGroup(e.target.value)}
                className="h-9"
                placeholder="e.g. Demographics"
              />
            </div>
          </div>
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
