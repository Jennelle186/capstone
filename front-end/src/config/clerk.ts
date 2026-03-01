// Centralized Clerk publishable key lookup for consistent app startup checks.
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}
