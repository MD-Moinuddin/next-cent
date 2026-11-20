// Test-only module aliasing for the Playwright web build. The stub replaces Clerk so the SPA can be driven
// without a real Clerk instance. It is active ONLY when EXPO_PUBLIC_E2E_STUB_AUTH=1 is set at build time
// (script `build:web:e2e`), and it refuses to work in a production build.
const path = require("node:path");

const FLAG = "EXPO_PUBLIC_E2E_STUB_AUTH";

// Fail-CLOSED guard. With the flag on, the stub is allowed ONLY for
//  (a) the dedicated E2E export: argv has `--output-dir` immediately followed by exactly `dist-e2e`
//      (or `--output-dir=dist-e2e`). `expo export` forces NODE_ENV=production and a --dev export is unusable,
//      so the E2E bundle is built in production mode; or
//  (b) NODE_ENV exactly "development" or "test" (local dev server, jest).
// Everything else (NODE_ENV unset, "production" for any other output dir, any other value) throws.
// scripts/assert-no-e2e-stub.mjs is the post-build safety net that scans the exported bundle.
const E2E_OUTPUT_DIR = "dist-e2e";

function isE2eExport(argv) {
  return argv.some(
    (a, i) =>
      a === `--output-dir=${E2E_OUTPUT_DIR}` ||
      (a === "--output-dir" && argv[i + 1] === E2E_OUTPUT_DIR),
  );
}

function isStubEnabled(env = process.env, argv = process.argv) {
  const on = env[FLAG] === "1";
  if (!on) return false;
  if (isE2eExport(argv)) return true;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return true;
  throw new Error(
    `${FLAG}=1 must never be used in a production build (NODE_ENV=${env.NODE_ENV ?? "unset"}). ` +
      `It is only allowed for the dedicated E2E export (expo export --output-dir ${E2E_OUTPUT_DIR}) ` +
      `or with NODE_ENV=development/test.`,
  );
}

/** Returns the stub file that replaces `moduleName`, or null (always null unless the flag is on). */
function stubFor(moduleName, env = process.env, argv = process.argv) {
  if (!isStubEnabled(env, argv)) return null;
  const dir = path.join(__dirname, "src", "__e2e__");
  if (/(^@\/|\/)lib\/auth\/ClerkAuth$/.test(moduleName))
    return path.join(dir, "StubAuth.tsx");
  if (moduleName === "@clerk/expo/legacy")
    return path.join(dir, "clerkLegacyStub.ts");
  return null;
}

/** Wraps a Metro resolveRequest; a no-op passthrough unless the stub flag is on. */
function withE2eStub(config, env = process.env, argv = process.argv) {
  isStubEnabled(env, argv); // fail fast at config load
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const stub = stubFor(moduleName, env, argv);
    if (stub) return { type: "sourceFile", filePath: stub };
    return upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
}

module.exports = { FLAG, E2E_OUTPUT_DIR, isStubEnabled, stubFor, withE2eStub };
