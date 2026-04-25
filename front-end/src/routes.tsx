import { createBrowserRouter, Navigate } from "react-router";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import TermsPage from "./pages/TermsPage";
import StudentDashboard from "./pages/students/StudentDashboard";
import UploadDocuments from "./pages/students/UploadDocuments";
import ProfileSettings from "./pages/students/ProfileSettings";
import RootLayout from "./layouts/RootLayout";
import StudentLayout from "./layouts/StudentLayout";
import TeacherDashboardLayout from "./layouts/TeacherDashboardLayout";
import AdminLayout from "./layouts/AdminLayout";
import TeacherDashboard from "./pages/teachers/TeacherDashboard";
import TeacherProfilePage from "./pages/teachers/TeacherProfilePage";
import AdminDashboardPage from "./pages/admin/dashboard/AdminDashboardPage";
import AdvisersPage from "./pages/admin/advisers/AdvisersPage";
import ReportsPage from "./pages/admin/reports/ReportsPage";
import DepartmentsPage from "./pages/admin/departments/DepartmentsPage";
import SchoolYearsPage from "./pages/admin/school-years/SchoolYearsPage";
import DocumentTypesPage from "./pages/admin/document-types/DocumentTypesPage";
import RequirementsPage from "./pages/admin/requirements/RequirementsPage";
import RequireGuest from "./components/auth/RequireGuest";
import SsoCallbackPage from "./pages/SsoCallbackPage";
import { RequireStudent, RequireAdviser, RequireAdmin } from "./components/auth/RequireRole";
import PostAuthRedirectPage from "./pages/PostAuthRedirectPage";

const AppRoutes = createBrowserRouter([
    {
        path: "/",
        Component: RootLayout,
        children: [
            { index: true, Component: HomePage },
            { path: "about", Component: AboutPage },
            { path: "terms", Component: TermsPage },
            // Central landing route for successful auth (password/OAuth).
            { path: "post-auth", Component: PostAuthRedirectPage },
            {
                path: "auth",
                children: [
                    {
                        Component: RequireGuest,
                        children: [
                            { path: "login", Component: LoginPage },
                            { path: "signup", Component: SignupPage },
                        ],
                    },
                    { path: "forgot-password", Component: ForgotPasswordPage },
                ]
            }
        ],
    },
    {
        path: "/student",
        Component: RequireStudent,
        children: [
            {
                Component: StudentLayout,
                children: [
                    { index: true, element: <Navigate to="dashboard" replace /> },
                    { path: "dashboard", Component: StudentDashboard },
                    { path: "upload", Component: UploadDocuments },
                    // Allow nested Clerk UserProfile routes (e.g., /student/profile/security).
                    { path: "profile/*", Component: ProfileSettings },
                ],
            },
        ],
    },
    {
        path: "/adviser",
        Component: RequireAdviser,
        children: [
            {
                Component: TeacherDashboardLayout,
                children: [
                    { index: true, element: <Navigate to="dashboard" replace /> },
                    { path: "dashboard", Component: TeacherDashboard },
                    { path: "profile/*", Component: TeacherProfilePage },
                ],
            },
        ],
    },
    {
        path: "/admin",
        Component: RequireAdmin,
        children: [
            {
                Component: AdminLayout,
                children: [
                    { index: true, element: <Navigate to="dashboard" replace /> },
                    { path: "dashboard", Component: AdminDashboardPage },
                    { path: "advisers", Component: AdvisersPage },
                    { path: "departments", Component: DepartmentsPage },
                    { path: "document-types", Component: DocumentTypesPage },
                    { path: "requirements", Component: RequirementsPage },
                    { path: "reports", Component: ReportsPage },
                    { path: "settings/school-year", Component: SchoolYearsPage },
                ],
            },
        ],
    },
    {
        path: "/sso-callback",
        Component: SsoCallbackPage,
    },
    {
        path: "*",
        element: <div>Not Found</div>,
    },
]);

export default AppRoutes;
