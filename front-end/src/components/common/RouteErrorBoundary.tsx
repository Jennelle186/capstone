"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

// Shown instead of React Router's default error screen when a page throws while rendering.
// It stays small and self-contained: no hooks from the app's providers, so it still renders
// when those are the thing that failed.
export default function RouteErrorBoundary() {
  const error = useRouteError();

  // A 404 or other response from a route loader: say what happened in plain words.
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  const title = isNotFound ? "This page does not exist" : "Something went wrong on this page";
  const hint = isNotFound
    ? "Check the address, or go back and try again."
    : "Reload the page to continue. Your saved files are not affected.";

  // Show the technical reason as a small note, to help report the problem. It never replaces the message above.
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section
        role="alert"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{hint}</p>
        <p className="mt-2 text-xs text-slate-500">
          If this keeps happening, turn off browser translation for this site and try again.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={() => window.location.reload()} className="gap-2 rounded-xl">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Reload page
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/")} className="rounded-xl">
            Go to home
          </Button>
        </div>
        {detail && (
          <p className="mt-5 break-words font-mono text-[11px] text-slate-400">{detail}</p>
        )}
      </section>
    </main>
  );
}
