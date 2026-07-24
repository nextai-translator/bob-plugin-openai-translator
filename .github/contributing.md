# Contributing

This guide is for people changing the plugin. For installation or configuration help, start with the [configuration manual](../docs/configuration_manual_EN.md). Use [Issues](https://github.com/nextai-translator/bob-plugin-openai-translator/issues) for reproducible bugs and [Discussions](https://github.com/nextai-translator/bob-plugin-openai-translator/discussions) for usage questions or proposed features.

## Before you start

- Search existing issues and discussions.
- Include a reproduction when fixing a bug.
- Discuss new user-facing behavior before implementing it.
- Keep a pull request focused on one change.

Small documentation fixes and contained maintenance changes can go directly to a pull request.

## Set up the repository

Use the Bun version declared in `package.json`, then install dependencies:

```bash
bun install
```

Bob runs the built plugin in JavaScriptCore, not Node.js or a browser. Runtime code can use JavaScript built-ins, Bob globals, and bundled pure JavaScript. It cannot use Node.js APIs, browser APIs such as `fetch`, provider SDKs, or files outside the plugin package.

Read the [architecture notes](../docs/architecture.md) before changing configuration, providers, model capabilities, requests, or streaming.

## Find the owning code

| Change | Start here |
| --- | --- |
| Settings shown in Bob | `public/info.json`, `src/config.ts` |
| Built-in models or reasoning behavior | `src/utils/model-capabilities.ts` |
| Prompt behavior | `src/utils/prompt.ts` |
| Provider request or response format | `src/adapter/` |
| Cancellation, completion, or SSE handling | `src/adapter/base.ts`, `src/utils/sse.ts` |
| User guidance | `README.md`, `docs/configuration_manual_*.md` |

When adding a model, verify its current official API documentation, update both `MODEL_CATALOG` and the sorted menu in `public/info.json`, then add capability and request-body tests. Unknown models must not receive speculative optional parameters.

When adding a provider, keep its URL, authentication, payload, response, error, streaming, and validation behavior in one adapter. Reuse the shared transport and keep provider selection internal unless a documented provider contract requires a different boundary.

## Validate the change

Every change should pass:

```bash
bun run lint
bun run test
git diff --check
```

`bun run lint` includes Biome and TypeScript checking.

For runtime changes, create a fresh local package:

```bash
bun run package
```

This command builds the plugin, checks Bob runtime compatibility, and creates `dist/openai-translator-dev.bobplugin`. Its generated version extends the repository version only inside the archive, so repeated local builds can be installed without consuming the next stable version. Install it in Bob and verify the affected settings and behavior. Changes to request handling require one streaming and one non-streaming translation.

Run `bun run benchmark` when a change can affect a local hot path or bundle size. Live-provider cases are part of `bun run test` but stay skipped unless `RUN_LIVE_TESTS=1` and the corresponding API Key are explicitly supplied. Tests must never read local credential files.

## Open the pull request

Use a [Conventional Commit](https://www.conventionalcommits.org/) title. In the description, state the user-visible or runtime behavior changed, list the validation performed, and link any related issue. Do not include unrelated formatting or generated-file changes.
