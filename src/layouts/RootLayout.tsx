// src/layouts/RootLayout.tsx
import { Outlet } from "react-router";
import Header from "@/components/common/Header";
import Footer from "@/components/common/Footer";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout() {
    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <main className="flex-1">
                <Outlet />   {/* ROUTES RENDER HERE */}
            </main>

            <Toaster />
            <Footer />
        </div>
    );
}
