import { Skeleton } from "@/components/ui/skeleton";
import UploadZoneSkeleton from "@/components/student/UploadDocuments/upload/upload-zone-skeleton";

export default function UploadDocumentsSkeleton() {
  return (
    <main className="space-y-6">
      <UploadZoneSkeleton />
      <div className="flex flex-wrap justify-end gap-2">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </main>
  );
}
