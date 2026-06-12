import { useParams, useSearchParams } from "react-router";
import { User } from "lucide-react";

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const name = searchParams.get("name") ?? "—";
  const documentType = searchParams.get("documentType") ?? "—";
  const submittedAt = searchParams.get("submittedAt") ?? "—";

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <User className="mb-4 h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Student: {name}
      </h1>
      <div className="mt-4 space-y-1 text-center text-sm text-muted-foreground">
        <p>ID: {id}</p>
        <p>Document: {documentType}</p>
        <p>Submitted: {submittedAt}</p>
      </div>
    </div>
  );
}
