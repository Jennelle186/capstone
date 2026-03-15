import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SsoCallbackPage() {
  // Handles OAuth redirect completion for Clerk social auth flows.
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-slate-900">
            <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            Signing you in...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>Completing Google sign-in. This can take a few seconds.</p>
          <p className="text-xs text-slate-500">
            If you are not redirected automatically, go back and try again.
          </p>
        </CardContent>
      </Card>

      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/student/dashboard"
        signUpForceRedirectUrl="/student/dashboard"
        signInFallbackRedirectUrl="/student/dashboard"
        signUpFallbackRedirectUrl="/student/dashboard"
      />
    </main>
  );
}
