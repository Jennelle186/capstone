import React from 'react';

interface AuthLayoutProps {
    children: React.ReactNode;
    imageUrl: string;
    imageAlt: string;
    overlayContent?: React.ReactNode;
}

export default function AuthLayout({
    children,

}: AuthLayoutProps) {
    return (
        <div className="min-h-screen flex flex-col bg-white">

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center px-6 md:px-10 py-8">
                <div className="w-full max-w-md">
                    {children}
                </div>
            </div>

            {/* Footer */}

        </div>
    );
}