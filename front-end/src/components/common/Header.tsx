import { useState } from "react";
import { Link, NavLink } from "react-router";
import { Button } from "../ui/button";

const navLinkClass =
    "text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors";

const Header = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
                <Link
                    to="/"
                    className="flex items-center gap-3 text-lg font-semibold text-slate-900 hover:opacity-90 transition-opacity"
                >
                    <img
                        src="/ccs-logo.jpg"
                        alt="School logo"
                        className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                    />
                    <div className="leading-tight">
                        <span className="block text-base md:text-lg">
                            CCS Enrollment Document System
                        </span>
                        <span className="block text-xs text-slate-500">
                            College of Computing Studies - Western Mindanao State University
                        </span>
                    </div>
                </Link>

                <nav aria-label="Primary" className="hidden md:flex items-center gap-4">
                    <NavLink to="/" className={navLinkClass}>
                        Home
                    </NavLink>
                    <NavLink to="/about" className={navLinkClass}>
                        About
                    </NavLink>
                    <NavLink to="/auth/login" className={navLinkClass}>
                        Login
                    </NavLink>
                    <Button asChild size="sm">
                        <Link to="/auth/signup">Get Started</Link>
                    </Button>
                </nav>

                <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 md:hidden"
                    aria-label="Toggle navigation"
                    aria-controls="mobile-nav"
                    aria-expanded={isOpen}
                    onClick={() => setIsOpen((prev) => !prev)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                    >
                        {isOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </>
                        ) : (
                            <>
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </>
                        )}
                    </svg>
                </button>
            </div>
            {isOpen && (
                <div className="md:hidden border-t border-slate-200 bg-white">
                    <nav
                        id="mobile-nav"
                        aria-label="Mobile"
                        className="flex flex-col gap-3 px-6 py-4 text-sm"
                    >
                        <NavLink to="/" className={navLinkClass} onClick={() => setIsOpen(false)}>
                            Home
                        </NavLink>
                        <NavLink to="/about" className={navLinkClass} onClick={() => setIsOpen(false)}>
                            About
                        </NavLink>
                        <NavLink to="/auth/login" className={navLinkClass} onClick={() => setIsOpen(false)}>
                            Login
                        </NavLink>
                        <Button asChild size="sm" className="w-full justify-center">
                            <Link to="/auth/signup" onClick={() => setIsOpen(false)}>
                                Get Started
                            </Link>
                        </Button>
                    </nav>
                </div>
            )}
        </header>
    );
};

export default Header;
