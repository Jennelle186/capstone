export {}

declare global {
  interface CustomJwtSessionClaims {
    email?: string
    role?: string
    first_name?: string
    last_name?: string
  }
}
