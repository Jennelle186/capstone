"use client";

import { Bell } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/notifications";

const TYPE_NAV_MAP: Record<string, string> = {
  DOCUMENT_VERIFIED: "/student/extraction/",
  DOCUMENT_FLAGGED: "/student/extraction/",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    const base = TYPE_NAV_MAP[n.type];
    if (base && n.reference_id) {
      navigate(`${base}${n.reference_id}`);
    }
  };

  const latestFive = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-slate-500 hover:text-primary"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {latestFive.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        )}
        {latestFive.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => handleClick(n)}
            className={cn(
              "flex flex-col items-start gap-0.5 py-3 cursor-pointer",
              !n.is_read && "bg-primary/5",
            )}
          >
            <div className="flex items-center gap-2 w-full">
              {!n.is_read && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
              <span className="text-sm font-medium">{n.title}</span>
            </div>
            <span className="text-xs text-muted-foreground line-clamp-1">
              {n.message}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {formatTime(n.created_at)}
            </span>
          </DropdownMenuItem>
        ))}
        {notifications.length > 5 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/student/notifications")}
              className="justify-center text-sm text-primary font-medium cursor-pointer"
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
