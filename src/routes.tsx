import { createBrowserRouter } from "react-router";
import LoginPage from "./pages/LoginPage";
import RootLayout from "./layouts/RootLayout";

const AppRoutes = createBrowserRouter([
    {
        path: "/",
        Component: RootLayout,
        children: [
            { index: true, element: <h1> Homepage</h1> },
            { path: "about", element: <div>About</div> },
            {
                path: "auth",
                children: [
                    { path: "login", Component: LoginPage },
                    { path: "signup", element: <div>Signup Page</div> },
                ]
            }
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