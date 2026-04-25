# Admin Pages Structure

Admin route-level pages are grouped by feature under `src/pages/admin/`.

## Current Layout

```txt
src/pages/admin/
  advisers/AdvisersPage.tsx
  departments/DepartmentsPage.tsx
  dashboard/AdminDashboardPage.tsx
  document-types/DocumentTypesPage.tsx
  requirements/RequirementsPage.tsx
  reports/ReportsPage.tsx
  school-years/SchoolYearsPage.tsx
```

## Rules

- Keep admin route pages in their feature folder under `src/pages/admin/`.
- Keep reusable admin UI in `src/components/admin/`.
- Keep shared types in `src/types/`.
- Extract reusable logic into `src/hooks/` when page files become large.
