<!-- BEGIN:fastify-agent-rules -->
# API — Fastify 5 + TypeScript

This is Fastify 5. APIs may differ from your training data.
- Use `fastify-type-provider-zod` for route schema validation and serialization — not Fastify's built-in JSON schema.
- Always register `validatorCompiler` and `serializerCompiler` on the app instance before registering routes.
- Plugins go in `src/plugins/`, routes in `src/routes/`.
- Import with `.js` extension (NodeNext module resolution).
<!-- END:fastify-agent-rules -->

<!-- BEGIN:ponytail-ref -->
# Coding behavior

Ponytail is installed globally — see `apps/web/CONTRIBUTING.md` § "AI Agent Behavior" for the full ladder.
<!-- END:ponytail-ref -->
