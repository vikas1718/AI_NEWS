# AI News Studio - Build Plan

AI News Studio is the public home and product identity for this project. The root route must display the modern AI News Studio landing page with the headline "The Future of AI-Powered Newsrooms Starts Here" and the newsroom command preview. Do not restore any older landing page.

## Public Home

- Route: `/`
- Component: `src/components/landing/AiNewsStudioLanding.tsx`
- Route file: `src/routes/index.tsx`
- Brand: AI News Studio
- Primary headline: The Future of AI-Powered Newsrooms Starts Here
- Navigation: Home, Features, Solutions, How It Works, About, Contact, Sign In, Get Started
- Primary action: Get Started -> `/auth?mode=signup`
- Sign-in action: Sign In -> `/auth?mode=signin`

## Removed Legacy Home

The older landing page and its copy are deprecated and must not be used for the root route. The public landing route should only render `AiNewsStudioLanding`.

## Auth

- Route: `/auth`
- Supports sign in and sign up.
- Password fields include visible show/hide controls.
- Sign-up creates a new account through Supabase Auth and creates/updates the matching profile role.
- Forgot password starts an email recovery flow.
- Recovery emails are configured to send an OTP using `supabase/templates/recovery.html`.
- If Supabase sends a recovery link, the app redirects recovery sessions to `/auth` so the user can complete the reset in the auth screen instead of landing on the public home.

## Product Scope

The authenticated app remains a newsroom CMS with Editor and Chief Editor roles, AI article processing, layout generation, review, approval, and publishing workflows.

## Stack

- TanStack Start
- React
- Tailwind
- shadcn/ui
- Supabase Auth, Postgres, Storage, and Edge Functions
- Lovable AI Gateway for AI-assisted article, image, and workflow features
