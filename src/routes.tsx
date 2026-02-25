import { createBrowserRouter } from "react-router";
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

const AppRoutes = createBrowserRouter([
    {
        path: "/",
        Component: RootLayout,
        children: [
            { index: true, Component: HomePage },
            { path: "about", Component: AboutPage },
            { path: "terms", Component: TermsPage },
            {
                path: "auth",
                children: [
                    { path: "login", Component: LoginPage },
                    { path: "signup", Component: SignupPage },
                    { path: "forgot-password", Component: ForgotPasswordPage },
                ]
            }
        ],
    },
    {
        path: "/student",
        Component: StudentLayout,
        children: [
            { path: "dashboard", Component: StudentDashboard },
            { path: "upload", Component: UploadDocuments },
            { path: "profile", Component: ProfileSettings },
        ],
    },
    {
        path: "/about",
        element: <div>About</div>,
    },
    {
        path: "*",
        element: <div>Not Found</div>,
    },
]);

export default AppRoutes;
