# Project Decisions

- Keep the user-facing app version in `App.tsx` and persist accepted versions in local storage, because update confirmation must run before any page-specific workflow.