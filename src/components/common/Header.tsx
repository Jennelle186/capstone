const Header = () => {
    return (
        <div className="border-b border-slate-200 px-6 md:px-10 py-6">
            <div className="max-w-7xl mx-auto">
                <a
                    href="/"
                    className="flex items-center gap-2 text-2xl font-bold text-primary hover:opacity-80 transition-opacity"
                >
                    <img
                        src="/ccs-logo.jpg"
                        alt="CCS Logo"
                        className="h-10 w-10 rounded"
                    />
                    <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent font-semibold">
                        Enrolment Document Management System
                    </span>
                </a>
            </div>
        </div>
    );
}

export default Header;