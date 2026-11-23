import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import router from "./routes.tsx"
import { ClerkProvider } from '@clerk/clerk-react'
import { CLERK_PUBLISHABLE_KEY } from "./config/clerk"
import DeactivatedAccountWatcher from "./components/auth/DeactivatedAccountWatcher"

import "./index.css"


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ClerkProvider must wrap RouterProvider so route components can access auth hooks. */}
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} >
      <DeactivatedAccountWatcher />
      <RouterProvider router={router} />
    </ClerkProvider>
  </StrictMode>,
);
