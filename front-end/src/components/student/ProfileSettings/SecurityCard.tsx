"use client";

import { Shield } from "lucide-react";
import EmailSection from "./security/EmailSection";
import PasswordSection from "./security/PasswordSection";
import ConnectedAccountsSection from "./security/ConnectedAccountsSection";
import SessionsSection from "./security/SessionsSection";

export default function SecurityCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Security &amp; Account</h3>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <EmailSection />
        <PasswordSection />
        <ConnectedAccountsSection />
        <SessionsSection />
      </div>
    </div>
  );
}
