import { createBrowserRouter } from "react-router";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import TermsPage from "./pages/TermsPage";
import StudentDashboard from "./pages/students/StudentDashboard";
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
                ]
            }
        ],
    },
    {
        path: "/student",
        element: <StudentLayout />,
        children: [
            { path: "dashboard", Component: StudentDashboard },
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
