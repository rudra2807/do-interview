# do-interview

[![CI](https://github.com/rudra2807/do-interview/actions/workflows/ci.yml/badge.svg)](https://github.com/rudra2807/do-interview/actions/workflows/ci.yml)

## CI

On every push to main and every pull request, GitHub Actions runs the full check: install, generate the Prisma client, apply migrations against a throwaway postgres:16 service container, typecheck, run the test suite, and build. No lint step exists yet since there is no ESLint config in the repo, and there is no deploy job or seed step. See `.github/workflows/ci.yml`.
