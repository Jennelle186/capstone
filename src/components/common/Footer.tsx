const Footer = () => {
    return (
        <div className="border-t border-slate-200 px-6 md:px-10 py-4 bg-slate-50">
            <p className="text-center text-xs text-slate-500 max-w-7xl mx-auto">
                &copy; {new Date().getFullYear()} Enrolment Document Management System. All rights reserved.
            </p>
        </div>
    );
}

export default Footer;