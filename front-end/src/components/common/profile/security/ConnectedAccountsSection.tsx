"use client";

import { useUser } from "@clerk/clerk-react";
import { Link, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ConnectedAccountsSection() {
  const { user } = useUser();

  const handleDisconnect = async (accountId: string) => {
    try {
      const account = user!.externalAccounts.find((a) => a.id === accountId);
      if (!account) return;
      await (account as unknown as { destroy: () => Promise<void> }).destroy();
      toast.success("Account disconnected.");
    } catch {
      toast.error("Failed to disconnect account.");
    }
  };

  return (
    <section>
      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
        <Link className="h-4 w-4 text-primary" />
        Connected Accounts
      </h4>
      <div className="space-y-2">
        {user!.externalAccounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <span className="text-sm font-bold text-slate-600">
                  {(account.provider ?? "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 capitalize">
                  {account.provider ?? "Unknown"}
                </p>
                <p className="text-xs text-slate-500">
                  {account.emailAddress ?? ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 h-8 px-2"
              onClick={() => handleDisconnect(account.id)}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {user!.externalAccounts.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">
            No connected accounts.
          </p>
        )}
      </div>
    </section>
  );
}
