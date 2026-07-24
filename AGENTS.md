# Coding Agent Instructions

## Bob boundary

The shipped plugin runs in Bob's JavaScriptCore host, not Node.js or a browser. Development tooling may use Node.js or browser APIs, but runtime code is limited to JavaScript built-ins, Bob globals, and bundled pure JavaScript.

Bob's settings form is static and space-constrained. Design it around the person configuring the plugin, not the adapter structure.

Bob's installed behavior is the source of truth when it disagrees with documentation, type declarations, or assumptions from other JavaScript runtimes. In particular:

- Do not assume a callback-based Bob API also returns a Promise unless that behavior has been observed in Bob.
- Preserve Bob field names that look unusual or misspelled when the runtime contract uses them.
- Verify installation and update behavior with the copied plugin metadata, not merely the archive contents.

## Product defaults

Use these defaults until a concrete user need or provider contract justifies revisiting them. When evidence does not determine the user-facing behavior, present the specific tradeoff to the maintainer before changing it.

- Keep the common setup to API Key, model, and an optional complete API URL. Prefer deriving provider, protocol, Base URL, and API Path internally; add another setting only when a real service cannot otherwise be configured clearly.
- Use "OpenAI 兼容 API" as the user-facing category for gateways, proxies, and services exposing `/responses` or `/chat/completions`. Name individual services in the manual only when they provide a useful configuration example or behave differently.
- Use raw model IDs as model labels by default. Add qualifiers only when they resolve a real ambiguity, not to convey provider branding, performance tiers, or marketing claims.
- Reasoning currently offers the model default and the lowest or disabled setting. Expand it only when a demonstrated translation use case justifies the additional choice.
- Temperature is currently omitted because supported model families do not share a stable sampling contract. Reintroduce it only with evidence for coherent behavior and a clear user benefit.
- The system prompt changes the task, such as translation to polishing. The user prompt refines each input within that task. Keep both defaults, placeholders, and keyword insertion editable.
- Treat saved-setting compatibility and migration as release decisions. If a change requires choosing between a clean break and a migration, confirm the intended release scope instead of inferring it from the current version.

`public/info.json` is Chinese-first; common technical names may remain in English. Describe user capabilities rather than adapter mechanics, omit context Bob already displays, keep descriptions concise without trailing sentence punctuation, and link detailed guidance to the exact configuration-manual heading.

## Architecture tradeoffs

- Isolate provider wire differences while sharing the Bob request lifecycle. Direct adapters are preferred at the current scale; reconsider SDKs or a broader provider abstraction only when they reduce demonstrated complexity and remain compatible with JavaScriptCore.
- Add model controls from current official provider evidence. For unknown models and partially compatible APIs, omit optional controls rather than infer support.
- A configured non-Azure API URL currently uses an OpenAI-compatible wire format. Verified official MiniMax hosts keep the MiniMax codec because their stream semantics differ. Supporting another native-provider proxy format is a product choice, not a URL-detection shortcut.
- Validate compatible services with a small generation request because `/models` is not a reliable cross-service contract.
- Preserve a real SSE parser: line splitting does not handle arbitrary chunk boundaries or multiline events.
- Evaluate performance through local selection, request construction, parsing, and bundle size. Network latency does not establish an architecture improvement.
- Route failures through Bob's supported completion callback with a useful `ServiceError.message`. Keep diagnostic logs identifiable by the plugin identifier without logging credentials or request bodies.

## Documentation boundaries

- `README.md` is the concise Chinese installation and configuration entry point.
- The Chinese and English configuration manuals own detailed user guidance.
- `docs/architecture.md` owns rationale, source coverage, rejected alternatives, and performance evidence.
- `.github/contributing.md` is for human contributors arriving without repository context.

Link to exact manual sections instead of repeating endpoint lists or advanced settings. Keep both languages, Bob metadata, runtime defaults, and tests behaviorally aligned.

Sort unordered links, examples, mappings, and reference collections by their displayed label or value. Preserve task, navigation, and lifecycle order when sequence carries meaning.

## Validation limits

Static checks cannot prove behavior inside Bob. Runtime changes need a packaged-plugin smoke test covering settings rendering, provider validation, one streaming translation, and one non-streaming translation.

The current Bob release ignores plugin packages whose version is not newer than the installed copy. Keep the repository version unchanged during development, and require the generated archive version to be proven newer than the installed release but older than the next stable release. Verify the copied metadata after opening the package because installation completes asynchronously.

Live-provider probes are opt-in and use only credentials explicitly supplied for that run. Never discover credentials from local files or credential stores.
