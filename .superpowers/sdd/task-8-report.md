# Task 8 — File upload route

## Status
DONE

## What was done
- Added `POST /uploads` route (`apps/api/src/routes/uploads.ts`) behind `app.authenticate` using `@fastify/multipart` for parsing and `crypto.randomUUID()` for unique filenames.
- Registered `@fastify/static` in `apps/api/src/app.ts` to serve the `./uploads` directory at `/uploads/` prefix.
- Created the uploads dir at module load (`mkdirSync(..., { recursive: true })`).
- Wrote TDD test `apps/api/src/routes/uploads.test.ts` (2 tests): 401 without token, and 201 with public URL matching `/^\/uploads\/.+\.png$/`.
- Installed `form-data` + `@types/form-data` as dev dependencies.
- Added `uploads` to `apps/api/.gitignore`.

## Test summary
- Single file: 2 passed.
- Full suite: 7 files, 35 tests passed.
- Lint: clean (after `lint:fix` reordered imports).

## Notes / deviations from brief
- Brief's inline sample used `Date.now()-Math.random()` for filenames and `res.json()` untyped; per task constraints (use `crypto.randomUUID()` and typed `res.json<...>()`), the implementation uses `randomUUID()` and the test uses `res.json<UploadResponse>()`.
- `@fastify/multipart` registered inside the upload plugin (scoped), `@fastify/static` registered in `app.ts` globally — POST `/uploads` route is registered before static so it is matched for POST; static serves GET `/uploads/*`.

## Commit
See git log (`feat(api): file upload route with local storage`).
