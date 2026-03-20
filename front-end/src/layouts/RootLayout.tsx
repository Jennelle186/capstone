// src/layouts/RootLayout.tsx
import { Outlet, useLocation } from "react-router";
import Header from "@/components/common/Header";
import Footer from "@/components/common/Footer";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout() {
    const { pathname } = useLocation();
    const isStudentArea = pathname.startsWith("/student");
    const isLandingPage = pathname === "/";
    const needsHeaderOffset = !isStudentArea && !isLandingPage;

    return (
        <div className="min-h-screen flex flex-col">
            {!isStudentArea && <Header />}

            <main className={`flex-1 ${needsHeaderOffset ? "pt-16" : ""}`}>
                <Outlet />   {/* ROUTES RENDER HERE */}
            </main>

            <Toaster />
            {!isStudentArea && <Footer />}
        </div>
    );
}
