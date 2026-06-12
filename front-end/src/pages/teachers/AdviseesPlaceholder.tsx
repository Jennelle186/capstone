import { Construction } from "lucide-react";

export default function AdviseesPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Construction className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">
        My Advisees
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This page is coming soon.
      </p>
    </div>
  );
}
