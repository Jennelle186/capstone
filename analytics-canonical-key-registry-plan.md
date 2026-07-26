# Analytics Canonical Key Registry — Problem, Solution & Implementation Plan

## Table of Contents
1. [The Problem](#the-problem)
2. [The Solution](#the-solution)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [Backend Changes](#backend-changes)
6. [Frontend Changes](#frontend-changes)
7. [Files Affected & Risk Matrix](#files-affected--risk-matrix)
8. [Execution Order](#execution-order)
9. [AI Implementation Prompt](#ai-implementation-prompt)

---

## The Problem

In the current system, analytics dimensions (like "SHS Strand", "Gender", "Place of Birth") are defined implicitly inside each extraction schema's `fields_json`. There is no central registry that says "these are all the analytics dimensions we track."

This causes **four concrete problems**:

### Problem 1: Phantom Dimensions
When two schemas define the same semantic concept under different keys, and an admin forgets to align the `canonical_key`, the system treats them as separate dimensions.

```
2025-2026 schema:  field_key="shs_strand",          canonical_key="shs_strand"
2026-2027 schema:  field_key="senior_high_strand",   canonical_key="senior_high_strand"  ← admin forgot to set

Analytics discovery shows:
  shs_strand            SHS Strand          High School Statistics
  senior_high_strand    Senior High Strand  High School Statistics  ← duplicate!
```

### Problem 2: No Uniform Grouping
The `analytics_group` value is stored per-schema. One schema might use `"High School Statistics"` while another uses `"High School Performance"` for the same concept. The snapshot UI shows the same dimension under inconsistent group headers.

### Problem 3: No Retirement Path
Old dimensions like `coastal_area` (only present in 2025-2026) show up forever in the Fields tab with `school_year_count: 1`. There is no way to mark them as "legacy" and hide them from active trend analysis.

### Problem 4: No 1→N Field Mapping Support
When a schema changes from a single field (`place_of_birth`) to multiple fields (`place_of_birth_city`, `place_of_birth_province`, `place_of_birth_country`), there is no mechanism to say "these three fields together produce the canonical `place_of_birth` dimension."

---

## The Solution

Add a **central registry table** (`analytics_dimensions`) that serves as the single source of truth for all analytics dimensions. Schema fields reference this registry via their `canonical_key` string.

### Core Principle
> Move from "discover dimensions by scanning schema JSON" to "define dimensions centrally, then reference them from schemas."

### What Changes
- **Discovery service** queries the registry directly instead of walking all schemas
- **Schema builder** shows a dropdown of existing dimensions with auto-suggest
- **Snapshot service** pulls `display_name` and `analytics_group` from the registry for consistency
- **New dimensions** are auto-created in the registry when an admin saves a schema with an unrecognized `canonical_key`
- **Legacy dimensions** can be marked `status="legacy"` and filtered out of active UI

### What Does NOT Change
- `canonical_key` still lives inside `fields_json` as the operational reference
- `snapshot_fields_json` still stores `canonical_key` strings — frozen snapshots never break
- Existing tests asserting on `canonical_key` values continue to pass
- The 3-step `extract_values()` fallback (`field_id` → `field_key` → `source_key`) stays intact

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CENTRAL REGISTRY: analytics_dimensions                         │
│  key            display_name         group               status │
│  shs_strand     SHS Strand           HS Statistics       active │
│  gender         Gender               Demographic         active │
│  coastal_area   Coastal Area         Demographic         legacy │
│  place_of_birth Place of Birth       Demographic         active │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ Schema 2025  │    │ Schema 2026  │    │ Snapshot     │
   │ fields_json  │    │ fields_json  │    │ Service      │
   │ canonical_key│    │ canonical_key│    │ Registry     │
   │ = "shs_strand│    │ = "shs_strand│    │ lookup for   │
   │              │    │              │    │ display_name │
   └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Database Schema

### New Table: `analytics_dimensions`

```sql
CREATE TABLE analytics_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    data_type TEXT NOT NULL,           -- string, number, boolean, select, multi-select
    analytics_group TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- active | legacy
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### New Table: `dimension_transforms` (Phase 2 — for 1→N mappings)

```sql
CREATE TABLE dimension_transforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension_key TEXT NOT NULL REFERENCES analytics_dimensions(key) ON DELETE CASCADE,
    schema_id UUID NOT NULL REFERENCES extraction_schemas(id) ON DELETE CASCADE,
    source_fields JSONB NOT NULL,
    transform_type TEXT NOT NULL DEFAULT 'concat',  -- concat | coalesce | pick_first
    separator TEXT DEFAULT ', ',
    UNIQUE(dimension_key, schema_id)
);
```

---

## Backend Changes

### 1. Alembic Migration
**File**: `backend/alembic/versions/20260716_add_analytics_dimensions_registry.py`

Creates both tables with proper foreign keys and indexes.

### 2. ORM Models
**File**: `backend/app/models.py`

Add `AnalyticsDimension` and `DimensionTransform` SQLAlchemy models near the existing `ExtractionSchema` model.

```python
class AnalyticsDimension(Base):
    __tablename__ = "analytics_dimensions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    key = Column(Text, unique=True, nullable=False, index=True)
    display_name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    data_type = Column(Text, nullable=False)
    analytics_group = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="active", server_default=sa.text("'active'"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class DimensionTransform(Base):
    __tablename__ = "dimension_transforms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    dimension_key = Column(Text, ForeignKey("analytics_dimensions.key", ondelete="CASCADE"), nullable=False)
    schema_id = Column(UUID(as_uuid=True), ForeignKey("extraction_schemas.id", ondelete="CASCADE"), nullable=False)
    source_fields = Column(JSONB, nullable=False, default=list, server_default=sa_text("'[]'::jsonb"))
    transform_type = Column(Text, nullable=False, default="concat", server_default=sa_text("'concat'"))
    separator = Column(Text, nullable=True)
```

### 3. Response Schemas
**File**: `backend/app/services/admin_analytics/response.py`

- Add `status` field to `CanonicalKeyItem`
- Add new `AnalyticsDimensionItem` Pydantic model

```python
class CanonicalKeyItem(BaseModel):
    canonical_key: str
    label: str
    field_type: str
    analytics_group: str | None = None
    school_year_count: int
    document_types: list[str] = []
    status: str = "active"  # NEW


class AnalyticsDimensionItem(BaseModel):
    id: str
    key: str
    display_name: str
    description: str | None = None
    data_type: str
    analytics_group: str
    status: str
```

### 4. Discovery Service Refactor
**File**: `backend/app/services/admin_analytics/discovery.py`

**Before**: Walks every `ExtractionSchema.fields_json`, groups by `canonical_key`, falls back to `field.key`.

**After**:
1. Query `analytics_dimensions` for the definitive list (filtering out `legacy` if desired)
2. For each dimension, count how many distinct school years have a schema field referencing it via `canonical_key`
3. Return sorted `CanonicalKeyItem[]` with enriched metadata
4. **Fallback**: catch any analytics fields with `canonical_key` NOT in registry and include them as `"status": "orphan"`

```python
async def get_canonical_keys(db: SessionDep) -> list[dict]:
    # 1. Load registry
    registry = (
        await db.execute(select(AnalyticsDimension))
    ).scalars().all()

    # 2. Build dimension → {schema_ids} mapping by scanning fields_json
    dim_schema_ids: dict[str, set[UUID]] = defaultdict(set)
    all_schemas = (await db.execute(select(ExtractionSchema))).scalars().all()
    for schema in all_schemas:
        for field in (schema.fields_json or []):
            if isinstance(field, dict) and field.get("is_analytics"):
                ck = field.get("canonical_key") or field.get("key")
                if ck:
                    dim_schema_ids[ck].add(schema.id)

    # 3. Map schema → school years and doc types via SYR
    all_syrs = (await db.execute(select(SchoolYearRequirement))).scalars().all()
    schema_to_sy: dict[str, set[UUID]] = defaultdict(set)
    schema_to_dt: dict[str, set[UUID]] = defaultdict(set)
    for syr in all_syrs:
        sid = str(syr.extraction_schema_id)
        if syr.extraction_schema_id:
            if syr.school_year_id:
                schema_to_sy[sid].add(syr.school_year_id)
            if syr.document_type_id:
                schema_to_dt[sid].add(syr.document_type_id)

    # 4. Resolve doc type names
    all_dt_ids = {dt_id for dts in schema_to_dt.values() for dt_id in dts}
    dt_names: dict[str, str] = {}
    if all_dt_ids:
        dt_result = await db.execute(
            select(DocumentType).where(DocumentType.id.in_(all_dt_ids))
        )
        for dt in dt_result.scalars().all():
            dt_names[str(dt.id)] = dt.name

    # 5. Compose result
    result = []
    for dim in registry:
        ck = dim.key
        sy_ids: set[UUID] = set()
        dt_names_set: set[str] = set()
        for schema_id in dim_schema_ids.get(ck, set()):
            sid = str(schema_id)
            sy_ids.update(schema_to_sy.get(sid, set()))
            for dt_id in schema_to_dt.get(sid, set()):
                name = dt_names.get(str(dt_id))
                if name:
                    dt_names_set.add(name)

        result.append({
            "canonical_key": ck,
            "label": dim.display_name,
            "field_type": dim.data_type,
            "analytics_group": dim.analytics_group,
            "school_year_count": len(sy_ids),
            "document_types": sorted(dt_names_set),
            "status": dim.status,
        })

    # 6. Fallback: orphan fields not in registry
    for schema in all_schemas:
        for field in (schema.fields_json or []):
            if isinstance(field, dict) and field.get("is_analytics"):
                ck = field.get("canonical_key") or field.get("key")
                if ck and not any(r["canonical_key"] == ck for r in result):
                    result.append({
                        "canonical_key": ck,
                        "label": field.get("analytics_label") or field.get("key", ck),
                        "field_type": field.get("type", "string"),
                        "analytics_group": field.get("analytics_group"),
                        "school_year_count": ...,
                        "document_types": [],
                        "status": "orphan",
                    })

    return sorted(result, key=lambda x: (x.get("analytics_group") or "", x["canonical_key"]))
```

### 5. Snapshot Service Enhancement
**File**: `backend/app/services/admin_analytics/snapshot.py`

In the field-building loop (around current line 233), replace:

```python
canonical_key = field.get("canonical_key") or field_key
label = field.get("analytics_label") or field.get("label") or snake_to_title(canonical_key)
analytics_group = field.get("analytics_group")
```

With a registry lookup:

```python
canonical_key = field.get("canonical_key") or field_key

registry_dim = None
if canonical_key:
    registry_dim = (
        await db.execute(
            select(AnalyticsDimension).where(AnalyticsDimension.key == canonical_key)
        )
    ).scalar_one_or_none()

label = (
    (registry_dim.display_name if registry_dim else None)
    or field.get("analytics_label")
    or field.get("label")
    or snake_to_title(canonical_key)
)

analytics_group = (
    (registry_dim.analytics_group if registry_dim else None)
    or field.get("analytics_group")
)
```

### 6. New Registry API Endpoints
**File**: `backend/app/routers/admin/analytics.py`

Add four CRUD endpoints:

```python
@router.get("/dimensions", response_model=list[AnalyticsDimensionItem])
async def list_dimensions(...): ...

@router.post("/dimensions", response_model=AnalyticsDimensionItem, status_code=201)
async def create_dimension(...): ...

@router.patch("/dimensions/{key}", response_model=AnalyticsDimensionItem)
async def update_dimension(...): ...

@router.delete("/dimensions/{key}", status_code=204)
async def delete_dimension(...): ...
```

### 7. Schema Save Validation — Auto-Create Registry Entries
**File**: `backend/app/routers/admin/extraction_schemas.py`

Add a helper function and call it in both `create_extraction_schema` and `update_extraction_schema` before `db.commit()`:

```python
async def _ensure_registry_entries(db, fields_json: list[dict]):
    """Auto-create AnalyticsDimension entries for any analytics field
    whose canonical_key does not yet exist in the registry.
    Never hard-fails — creates missing entries on the fly."""
    for field in fields_json:
        if not isinstance(field, dict):
            continue
        if not field.get("is_analytics"):
            continue
        ck = field.get("canonical_key") or field.get("key")
        if not ck:
            continue

        existing = (
            await db.execute(select(AnalyticsDimension).where(AnalyticsDimension.key == ck))
        ).scalar_one_or_none()

        if existing is None:
            dim = AnalyticsDimension(
                key=ck,
                display_name=field.get("analytics_label") or field.get("label") or ck,
                data_type=field.get("type", "string"),
                analytics_group=field.get("analytics_group") or "Uncategorized",
                status="active",
            )
            db.add(dim)
            await db.flush()
```

### 8. One-Time Backfill Script
**New file**: `backend/scripts/backfill_analytics_dimensions.py`

Walks all `ExtractionSchema.fields_json`, finds all `is_analytics=true` fields, deduplicates by `canonical_key`, and inserts into `analytics_dimensions`.

```python
"""Populate analytics_dimensions from existing schema fields JSON."""

import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import AnalyticsDimension, ExtractionSchema


async def main():
    async with AsyncSessionLocal() as db:
        schemas = (await db.execute(select(ExtractionSchema))).scalars().all()
        seen: dict[str, dict] = {}

        for schema in schemas:
            for field in (schema.fields_json or []):
                if not isinstance(field, dict):
                    continue
                if not field.get("is_analytics"):
                    continue
                ck = field.get("canonical_key") or field.get("key")
                if not ck or ck in seen:
                    continue
                seen[ck] = {
                    "key": ck,
                    "display_name": field.get("analytics_label") or field.get("label") or ck,
                    "data_type": field.get("type", "string"),
                    "analytics_group": field.get("analytics_group") or "Uncategorized",
                }

        inserted = 0
        for ck, info in seen.items():
            existing = (
                await db.execute(select(AnalyticsDimension).where(AnalyticsDimension.key == ck))
            ).scalar_one_or_none()
            if existing:
                continue
            dim = AnalyticsDimension(**info, status="active")
            db.add(dim)
            inserted += 1
            print(f"  Created: {ck}")

        await db.commit()
        print(f"\nDone. Created {inserted} dimensions, skipped {len(seen) - inserted} existing.")


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Frontend Changes

### 1. Types
**File**: `front-end/src/types/analytics.ts`

Update `CanonicalKeyItem` to include `status`:

```typescript
export interface CanonicalKeyItem {
  canonical_key: string
  label: string
  field_type: string
  analytics_group: string | null
  school_year_count: number
  document_types: string[]
  status: "active" | "legacy" | "orphan"   // NEW
}

export interface AnalyticsDimension {       // NEW
  id: string
  key: string
  display_name: string
  description?: string
  data_type: string
  analytics_group: string
  status: "active" | "legacy"
}
```

Update `CanonicalKeysResponse`:

```typescript
export interface CanonicalKeysResponse {
  keys: CanonicalKeyItem[]
}
```

### 2. Schema Builder — FieldEditorRow.tsx
**File**: `front-end/src/components/admin/extraction-schemas/FieldEditorRow.tsx`

#### 2.1 Load dimensions on mount

```typescript
import type { AnalyticsDimension } from "@/types/analytics"

// Inside the component:
const [dimensions, setDimensions] = useState<AnalyticsDimension[]>([])
const [showSuggestion, setShowSuggestion] = useState(false)
const [suggestedDimension, setSuggestedDimension] = useState<AnalyticsDimension | null>(null)

useEffect(() => {
  fetch("/api/admin/analytics/dimensions")
    .then(r => r.json())
    .then(setDimensions)
    .catch(() => {})  // silently fail — free-text input still works
}, [])
```

#### 2.2 Auto-suggest logic

```typescript
function suggestDimension(fieldKey: string, dims: AnalyticsDimension[]) {
  const normalized = fieldKey.toLowerCase().replace(/[_\s]/g, "")
  let best: AnalyticsDimension | null = null
  let bestScore = 0

  for (const dim of dims) {
    const dimNorm = dim.key.toLowerCase().replace(/[_\s]/g, "")
    let score = 0
    for (let i = 0; i < Math.min(normalized.length, dimNorm.length); i++) {
      if (normalized[i] === dimNorm[i]) score++
      else break
    }
    if (score > bestScore && score >= 3) {
      bestScore = score
      best = dim
    }
  }
  return best
}
```

#### 2.3 UX flow when toggling analytics

```typescript
const toggleAnalytics = () => {
  const next = !field.is_analytics
  if (next && !field.canonical_key) {
    const suggestion = suggestDimension(field.key, dimensions)
    if (suggestion) {
      setShowSuggestion(true)
      setSuggestedDimension(suggestion)
    }
    onUpdate(field.id, {
      is_analytics: true,
      canonical_key: suggestion?.key ?? normalizeFieldKey(field.key),
      analytics_group: suggestion?.analytics_group,
    })
  } else {
    onUpdate(field.id, {
      is_analytics: next,
      canonical_key: next ? field.canonical_key : null,
    })
  }
  setShowAnalytics(next)
}
```

#### 2.4 Suggestion banner

```tsx
{showSuggestion && suggestedDimension && (
  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
    💡 Did you mean{" "}
    <strong>
      {suggestedDimension.display_name} ({suggestedDimension.analytics_group})
    </strong>
    ?
    <div className="mt-2 flex gap-2">
      <button
        onClick={() => {
          onUpdate(field.id, {
            canonical_key: suggestedDimension.key,
            analytics_group: suggestedDimension.analytics_group,
          })
          setShowSuggestion(false)
        }}
        className="rounded bg-blue-600 px-3 py-1 text-xs text-white"
      >
        Yes, use this
      </button>
      <button
        onClick={() => setShowSuggestion(false)}
        className="rounded border border-gray-300 px-3 py-1 text-xs"
      >
        No, I'll choose
      </button>
    </div>
  </div>
)}
```

#### 2.5 Canonical key input becomes a combobox

Replace the plain `Input` with a searchable dropdown:

```tsx
<DropdownCombobox
  options={dimensions.map(d => ({
    value: d.key,
    label: `${d.display_name} (${d.analytics_group})`,
    group: d.analytics_group,
  }))}
  value={field.canonical_key ?? ""}
  placeholder="Type or select a dimension..."
  onSelect={(val) => {
    const dim = dimensions.find(d => d.key === val)
    onUpdate(field.id, {
      canonical_key: val,
      analytics_group: dim?.analytics_group,
    })
  }}
  onCreateNew={(val) => openCreateDimensionModal(val)}
/>
```

#### 2.6 Create new dimension modal

```typescript
const openCreateDimensionModal = async (key: string) => {
  const displayName = field.label || key
  const group = field.analytics_group || "Uncategorized"
  const dataType = field.type

  try {
    const res = await fetch("/api/admin/analytics/dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        display_name: displayName,
        data_type: dataType,
        analytics_group: group,
      }),
    })
    if (!res.ok) throw new Error("Failed to create dimension")
    const newDim: AnalyticsDimension = await res.json()
    setDimensions(prev => [...prev, newDim])
    onUpdate(field.id, {
      canonical_key: newDim.key,
      analytics_group: newDim.analytics_group,
    })
  } catch (err) {
    toast.error("Could not create dimension. Please try again.")
  }
}
```

### 3. FieldsTab — Legacy Filter
**File**: `front-end/src/components/admin/analytics/FieldsTab.tsx`

```typescript
const [showLegacy, setShowLegacy] = useState(false)

const visibleKeys = useMemo(() => {
  if (showLegacy) return keys
  return keys.filter(k => k.status !== "legacy")
}, [keys, showLegacy])
```

Add a toggle button in the UI:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={showLegacy}
    onChange={e => setShowLegacy(e.target.checked)}
  />
  Show legacy fields
</label>
```

### 4. Caching
**File**: `front-end/src/hooks/useAdminAnalyticsPage.ts` (+ adviser equivalent)

Add sessionStorage caching for canonical keys:

```typescript
const CACHE_KEY = "canonical_keys_cache"
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

const loadCanonicalKeys = useCallback(async () => {
  // Check cache
  const cached = sessionStorage.getItem(CACHE_KEY)
  if (cached) {
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < CACHE_TTL) {
      setCanonicalKeys(data)
      setIsLoadingCanonical(false)
      return
    }
  }

  setIsLoadingCanonical(true)
  try {
    const payload = (await requestWithAdminAuth(
      "/api/admin/analytics/canonical-keys",
    )) as CanonicalKeysResponse
    setCanonicalKeys(payload.keys)
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data: payload.keys, timestamp: Date.now() }),
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to load canonical keys.")
  } finally {
    setIsLoadingCanonical(false)
  }
}, [requestWithAdminAuth])
```

Invalidate the cache when a schema is saved (emit a custom event or call `sessionStorage.removeItem(CACHE_KEY)`).

---

## Files Affected & Risk Matrix

### Backend (HIGH risk if wrong)

| File | Risk | Why | Mitigation |
|------|------|-----|------------|
| `app/models.py` | **HIGH** | New tables; app won't start if migration missing | Run migration before app deploy |
| `app/services/admin_analytics/discovery.py` | **HIGH** | Fields tab empty if logic wrong | Keep old schema-walking as fallback for orphans |
| `app/services/admin_analytics/snapshot.py` | **HIGH** | Wrong labels/groups in analytics cards | Fall back to `fields_json` values if registry lookup fails |
| `app/routers/admin/extraction_schemas.py` | **HIGH** | Schema save fails if validation crashes | Auto-create missing entries — never hard-fail |
| `app/routers/admin/analytics.py` | **MEDIUM** | New endpoints; old ones must keep working | Additive change, existing routes untouched |
| `app/services/admin_analytics/response.py` | **MEDIUM** | Pydantic schema changes | Additive — new field with default value |
| `app/services/admin_analytics/field_values.py` | LOW | Transform resolution is new code path | No existing path modified |

### Frontend (MEDIUM risk)

| File | Risk | Why | Mitigation |
|------|------|-----|------------|
| `FieldEditorRow.tsx` | **HIGH** | Schema builder UX breaks if dropdown fails | Keep free-text input as fallback |
| `FieldsTab.tsx` | MEDIUM | Legacy filter toggle is additive | Old behavior unchanged |
| `types/analytics.ts` | LOW | Additive change | New fields with optional marker |
| `useAdminAnalyticsPage.ts` | LOW | Caching layer | Fail-open to fetch |
| `useAdviserExtractionAnalyticsPage.ts` | LOW | Same caching pattern | Fail-open to fetch |

### Tests & Seed Data

| File | Risk | Why | Mitigation |
|------|------|-----|------------|
| `seed_analytics_test_data.py` | MEDIUM | Must backfill registry after tagging schemas | Add registry population step after tagging |
| `tests/test_analytics_snapshot.py` | LOW | Asserts on `canonical_key` in response — still comes from `fields_json` | No change needed |
| `tests/test_admin_analytics.py` | LOW | No direct `canonical_key` assertions | No change needed |

---

## Execution Order

| Step | Description | Dependencies | Rollback if fails |
|------|-------------|--------------|-------------------|
| 1 | **Alembic migration** — create `analytics_dimensions` and `dimension_transforms` | None | `alembic downgrade` |
| 2 | **Update `models.py`** — add ORM classes | Step 1 | Git revert |
| 3 | **Backfill script** — run once to populate registry from existing schemas | Steps 1-2 | Delete inserted rows |
| 4 | **Add registry API endpoints** — `GET/POST/PATCH /dimensions` | Steps 1-2 | Can deploy without using them |
| 5 | **Refactor discovery service** — query registry first, fallback to schema scan | Steps 1-2 | Git revert |
| 6 | **Update snapshot service** — registry lookup for display metadata | Steps 1-2 | Git revert |
| 7 | **Add schema save validation** — auto-create missing registry entries | Steps 1-2 | Git revert |
| 8 | **Update frontend types** — add `status` and `AnalyticsDimension` | None | Git revert |
| 9 | **Update FieldEditorRow** — dropdown, auto-suggest, create-new flow | Steps 4, 8 | Free-text input still works as fallback |
| 10 | **Update FieldsTab** — legacy filter toggle | Step 8 | Old behavior unchanged |
| 11 | **Add caching** — sessionStorage for canonical keys | Step 5 | Fail-open to fetch |
| 12 | **Update seed script** — backfill registry after tagging schemas | Steps 1-2 | Seed script still works without it |
| 13 | **Run tests** — verify nothing broke | All above | Fix failures before merging |

---

## Key Design Decisions

### Why keep `canonical_key` in `fields_json`?

- Frozen `snapshot_fields_json` stores a copy of `fields_json` at a point in time. If we move `canonical_key` exclusively to the registry, old snapshots lose the connection. Keeping it in both places avoids this.
- The snapshot overlay logic (which overlays live `canonical_key` onto frozen snapshots) works because the key string is still in `fields_json`.
- The 3-step `extract_values()` fallback uses `field_id`, `field_key`, and `source_key` from `extracted_data` — none of this depends on the registry.
- Existing tests assert on `canonical_key` in snapshot responses — those strings still come from `fields_json`.

### Why registry-driven `analytics_group` without per-schema override?

- Uniform grouping across all school years is the whole point of canonical keys.
- If you want to reorganize groups, you change the registry once and all snapshots reflect it.
- If a future schema truly needs a different grouping, you can always add an override layer. Don't build it before you need it.

### Why auto-create registry entries instead of hard-failing validation?

- Schema saves must never fail because of missing registry entries. The admin workflow is: edit schema → toggle analytics → save. Making them also manage the registry explicitly is friction.
- Auto-creation with sensible defaults (`display_name` from field label, `analytics_group` from field group) means the registry stays consistent with zero admin effort.
- If the admin wants to refine the entry, they can do so via the registry API or pending admin UI.

---

## AI Implementation Prompt

Use this prompt with any AI coding assistant to implement the full plan:

```markdown
Implement an analytics dimensions registry for a FastAPI + React + PostgreSQL project.

## Context
The project has extraction schemas stored as JSONB in `extraction_schemas.fields_json`. Each field can have `is_analytics=true` and a `canonical_key` string. Currently, the analytics discovery service walks all schemas to find canonical keys — this causes duplicates when admins forget to align keys across schema versions.

## Goal
Add a central registry table (`analytics_dimensions`) so that:
1. All analytics dimensions are registered in one place
2. The schema builder shows a dropdown of existing dimensions with auto-suggest
3. New dimensions are auto-created when saving a schema with an unrecognized canonical_key
4. Legacy dimensions can be marked `status="legacy"` and hidden from active UI
5. Grouping is uniform across all school years

## Database
- Create `analytics_dimensions` table: id, key (unique), display_name, description, data_type, analytics_group, status, created_at, updated_at
- Create `dimension_transforms` table: id, dimension_key (FK), schema_id (FK), source_fields (JSONB), transform_type, separator, UNIQUE(dimension_key, schema_id)
- Write Alembic migration with proper foreign keys and indexes
- Add ORM models in `app/models.py` — `AnalyticsDimension` and `DimensionTransform`

## Backend API
Add endpoints in `app/routers/admin/analytics.py`:
- `GET /api/admin/analytics/dimensions` — list all dimensions
- `POST /api/admin/analytics/dimensions` — create new dimension (409 if key exists)
- `PATCH /api/admin/analytics/dimensions/{key}` — update display_name, description, data_type, analytics_group, status
- `DELETE /api/admin/analytics/dimensions/{key}` — delete dimension (204 on success)

## Backend Services
1. **Discovery** (`discovery.py`): Refactor to query `analytics_dimensions` as the primary source. Then count school years per dimension by scanning `fields_json`. Include a fallback that catches any `is_analytics=true` fields with canonical_keys NOT in the registry and returns them as `status: "orphan"`.
2. **Snapshot** (`snapshot.py`): In the field-building loop, look up `display_name` and `analytics_group` from the registry. Fall back to `fields_json` values if registry entry is missing.
3. **Schema save** (`extraction_schemas.py`): Add `_ensure_registry_entries()` helper that auto-creates `AnalyticsDimension` rows for any `is_analytics=true` field whose `canonical_key` doesn't exist in the registry. Call it in both `create_extraction_schema` and `update_extraction_schema` before `db.commit()`.
4. **Response models** (`response.py`): Add `status: str = "active"` to `CanonicalKeyItem`. Add `AnalyticsDimensionItem` Pydantic model.

## Frontend Types
In `front-end/src/types/analytics.ts`:
```typescript
export interface CanonicalKeyItem {
  canonical_key: string
  label: string
  field_type: string
  analytics_group: string | null
  school_year_count: number
  document_types: string[]
  status: string            // "active" | "legacy" | "orphan"
}

export interface AnalyticsDimension {
  id: string
  key: string
  display_name: string
  description?: string
  data_type: string
  analytics_group: string
  status: string
}
```

## Frontend Schema Builder (FieldEditorRow.tsx)
1. On mount, fetch dimensions from `/api/admin/analytics/dimensions`
2. When admin toggles `is_analytics`:
   - Run auto-suggest: fuzzy match `field.key` against registry dimension keys
   - If a match scores >= 3, show a banner: "Did you mean [dimension.display_name]?"
   - If accepted, set `canonical_key` to the matched dimension key
   - If rejected, show the dropdown
3. Replace the plain canonical_key `<Input>` with a searchable `<DropdownCombobox>` that:
   - Lists all dimensions with display name and group
   - Has a "Create new: [typed_value]" option at the bottom
4. "Create new" calls `POST /api/admin/analytics/dimensions` with derived defaults, then sets the field's `canonical_key`
5. If fetch fails, fall back to a free-text input so admin is never blocked

## Frontend FieldsTab
Add a checkbox "Show legacy fields" above the data table. When unchecked, filter out entries with `status === "legacy"`.

## Caching
In `useAdminAnalyticsPage.ts`, store `canonicalKeys` in `sessionStorage` with a 5-minute TTL. Invalidate cache when any schema save occurs (emit custom event or call `sessionStorage.removeItem`).

## Seed Data
In `seed_analytics_test_data.py`, after tagging schemas with `is_analytics`, run a deduplicated backfill into `analytics_dimensions` matching the existing `canonical_key` values.

## Backfill Script
Write `backend/scripts/backfill_analytics_dimensions.py` that walks all schemas, finds all `is_analytics=true` fields, deduplicates by `canonical_key`, and inserts missing entries into `analytics_dimensions`.

## Constraints
- Do NOT remove `canonical_key` from `fields_json` — it stays as the operational reference
- Do NOT change `snapshot_fields_json` behavior — frozen snapshots must keep working
- All existing tests (`test_analytics_snapshot.py`, `test_admin_analytics.py`) must pass without modification
- Auto-create missing registry entries on schema save — never hard-fail validation
- The 3-step `extract_values()` fallback must remain unchanged

## Implementation Order
1. Alembic migration
2. Models
3. Backfill script
4. Registry API endpoints
5. Discovery refactor
6. Snapshot enhancement
7. Schema save validation
8. Frontend types
9. FieldEditorRow (dropdown, auto-suggest, create-new)
10. FieldsTab (legacy filter)
11. Caching
12. Seed script update
13. Run tests
```
