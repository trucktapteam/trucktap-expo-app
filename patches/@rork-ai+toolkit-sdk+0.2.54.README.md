# Why this patch exists

`@rork-ai/toolkit-sdk@0.2.54`'s Metro transformer
(`metro/transformer.js`) runtime-requires `@expo/metro-config/babel-transformer`
directly from its published, shipped code.

However, the package's own `package.json` declares `@expo/metro-config` only
under `devDependencies`, not `dependencies` or `peerDependencies`. npm never
installs a nested package's `devDependencies` for anyone consuming that
package, so nothing guarantees `@expo/metro-config` is actually
installed/reachable at runtime — this is an upstream packaging bug, not a
resolution-strategy issue on our side.

Until Expo SDK 54.0.37 (see the four-patch-version bump in this repo's
history), `@expo/metro-config` happened to be hoisted to the project's
top-level `node_modules/` as an accidental side effect of `expo`'s own
transitive dependency graph shape, which is what let the bare `require(...)`
resolve successfully by coincidence. After that patch bump, `expo`'s own
internal dependency graph shifted slightly and npm stopped hoisting
`@expo/metro-config` to the root, breaking `expo export --platform web`
(`Cannot find module '@expo/metro-config/babel-transformer'`).

This patch changes only the one `require(...)` call to resolve
`@expo/metro-config` explicitly through `expo`'s own installed dependency
context (`require.resolve(..., { paths: [...] })` anchored at `expo`'s
package directory), so it works whether `@expo/metro-config` ends up hoisted
or nested. No other file is touched, and none of Rork's transform logic is
reimplemented or duplicated.

**This patch is temporary.** Remove it (`npx patch-package` cleanup plus
deleting this file and the corresponding `.patch` file, and the `patch-package`
devDependency/`postinstall` script if no longer needed elsewhere) once Rork
publishes a release of `@rork-ai/toolkit-sdk` that either declares
`@expo/metro-config` as a real `dependency`/`peerDependency`, or resolves it
robustly itself.
