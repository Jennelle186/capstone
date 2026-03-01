const Footer = () => {
    return (
        <footer className="border-t border-slate-200 bg-slate-50">
            <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 grid gap-6 md:grid-cols-3 text-sm text-slate-600">
                <div>
                    <p className="text-base font-semibold text-slate-900">
                        CCS Enrollment Document System
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                        Internal platform for the College of Computing Studies, Western Mindanao
                        State University.
                    </p>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">Purpose</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>Student submissions and OCR review</li>
                        <li>Teacher and adviser verification</li>
                        <li>Status tracking for CCS administration</li>
                    </ul>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">Contact</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>College of Computing Studies</li>
                        <li>Enrollment and Records Office</li>
                        <li>support@wmsu.edu.ph</li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-slate-200 py-3 text-center text-xs text-slate-500">
                &copy; {new Date().getFullYear()} CCS Enrollment Document System. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
