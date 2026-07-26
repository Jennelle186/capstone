"use client";

import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import ConnectedAccountsSection from "./security/ConnectedAccountsSection";
import EmailSection from "./security/EmailSection";
import PasswordSection from "./security/PasswordSection";
import SessionsSection from "./security/SessionsSection";

export default function SecurityCard() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Security &amp; Account
        </CardTitle>
        <CardDescription>
          Managed by Clerk for authentication, passwords, and account protection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <EmailSection />
        <PasswordSection />
        <ConnectedAccountsSection />
        <SessionsSection />
      </CardContent>
    </Card>
  );
}
