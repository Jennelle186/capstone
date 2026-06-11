"use client";

import { useSessionList, useClerk } from "@clerk/clerk-react";
import { Laptop, Smartphone, Globe, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SessionsSection() {
  const { session } = useClerk();
  const { sessions } = useSessionList();
  const currentSessionId = session?.id;

  const handleRevoke = async (sessionId: string) => {
    try {
      const s = sessions?.find((s) => s.id === sessionId) as Record<string, unknown> & { revoke: () => Promise<void> } | undefined;
      if (!s) return;
      await s.revoke();
      toast.success("Session revoked.");
    } catch {
      toast.error("Failed to revoke session.");
    }
  };

  const formatTime = (d: Date) => {
    const now = new Date();
    const date = new Date(d);
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isToday) return `today at ${time}`;
    if (isYesterday) return `yesterday at ${time}`;
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
  };

  return (
    <section>
      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
        <Laptop className="h-4 w-4 text-primary" />
        Active Sessions
      </h4>
      <div className="space-y-2">
        {sessions?.map((s) => {
          const a = (s as unknown as {
            latestActivity?: {
              browserName?: string;
              browserVersion?: string;
              deviceType?: string;
              ipAddress?: string;
              city?: string;
              country?: string;
              isMobile?: boolean;
            };
          }).latestActivity;
          const isCurrent = s.id === currentSessionId;
          const isMobile = a?.isMobile ?? false;
          const os = a?.deviceType;
          const browser = [a?.browserName, a?.browserVersion].filter(Boolean).join(" ");
          const location = [a?.city, a?.country].filter(Boolean).join(", ");
          return (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${isCurrent ? "bg-emerald-100" : "bg-slate-100"
                    }`}
                >
                  {isMobile ? (
                    <Smartphone className="h-5 w-5 text-slate-600" />
                  ) : (
                    <Laptop className="h-5 w-5 text-slate-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {isCurrent ? "Current session" : "Other session"}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {os && (
                      <span className="flex items-center gap-1">
                        <Laptop className="h-3 w-3" />
                        {os}
                      </span>
                    )}
                    {browser && (
                      <span>{browser}</span>
                    )}
                    {a?.ipAddress && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {a.ipAddress}
                      </span>
                    )}
                    {location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(s.lastActiveAt)}
                    </span>
                  </div>
                </div>
              </div>
              {isCurrent ? (
                <Badge
                  variant="default"
                  className="text-[10px] uppercase tracking-widest shrink-0"
                >
                  Current Device
                </Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 h-8 px-2 shrink-0"
                  onClick={() => handleRevoke(s.id)}
                >
                  Log out
                </Button>
              )}
            </div>
          );
        })}
        {(!sessions || sessions.length === 0) && (
          <p className="text-sm text-slate-400 text-center py-4">No active sessions.</p>
        )}
      </div>
    </section>
  );
}
