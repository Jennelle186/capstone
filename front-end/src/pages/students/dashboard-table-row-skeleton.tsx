import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardTableRowSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-44" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-10" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-6 w-20 rounded-full" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-10" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-8 w-20 rounded-full" />
      </td>
    </tr>
  );
}
