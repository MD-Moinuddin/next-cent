/// <reference types="node" />
/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const { isStubEnabled, withE2eStub } = require(join(APP, "metro-e2e"));

const E2E = ["expo", "export", "-p", "web", "--output-dir", "dist-e2e"];
const E2E_EQ = ["expo", "export", "--output-dir=dist-e2e"];
const RELEASE = ["expo", "export", "-p", "web", "--output-dir", "dist"];
const TRICKY = ["expo", "export", "--output-dir", "dist", "--x", "dist-e2e"];
const NONE: string[] = [];
const NODE_ENVS = [undefined, "production", "development", "test", "staging"];
const env = (NODE_ENV: string | undefined, flag?: string) => ({
  ...(NODE_ENV === undefined ? {} : { NODE_ENV }),
  ...(flag === undefined ? {} : { EXPO_PUBLIC_E2E_STUB_AUTH: flag }),
});

describe("guard: flag off", () => {
  it.each(NODE_ENVS)("never enabled (NODE_ENV=%s), whatever argv", (n) => {
    for (const argv of [E2E, E2E_EQ, RELEASE, TRICKY, NONE]) {
      for (const flag of [undefined, "", "0", "true", "2"]) {
        expect(isStubEnabled(env(n, flag), argv)).toBe(false);
      }
    }
  });
});

describe("guard: flag on (fail-closed)", () => {
  it.each(NODE_ENVS)("allows the dedicated E2E export (NODE_ENV=%s)", (n) => {
    expect(isStubEnabled(env(n, "1"), E2E)).toBe(true);
    expect(isStubEnabled(env(n, "1"), E2E_EQ)).toBe(true);
  });
  it.each(["development", "test"])("allows NODE_ENV=%s", (n) => {
    expect(isStubEnabled(env(n, "1"), RELEASE)).toBe(true);
    expect(isStubEnabled(env(n, "1"), NONE)).toBe(true);
  });
  it.each([undefined, "production", "staging", "Production"])(
    "throws for NODE_ENV=%s unless it is the E2E export",
    (n) => {
      for (const argv of [RELEASE, TRICKY, NONE, ["eas", "build"]]) {
        expect(() => isStubEnabled(env(n, "1"), argv)).toThrow(/never be used/);
      }
    },
  );
  it("does not accept dist-e2e anywhere but right after --output-dir", () => {
    expect(() =>
      isStubEnabled(env("production", "1"), [
        "--output-dir",
        "dist",
        "dist-e2e",
      ]),
    ).toThrow();
    expect(() => isStubEnabled(env("production", "1"), ["dist-e2e"])).toThrow();
    expect(() =>
      isStubEnabled(env("production", "1"), ["--output-dir", "dist-e2e-x"]),
    ).toThrow();
  });
  it("withE2eStub fails fast at config load", () => {
    expect(() =>
      withE2eStub({ resolver: {} }, env("production", "1"), RELEASE),
    ).toThrow(/never be used/);
  });
});

describe("wiring through metro.config.js", () => {
  const ctx = {
    resolveRequest: (_c: unknown, name: string) => ({
      type: "sourceFile",
      filePath: `/real/${name}`,
    }),
  };
  /** Loads metro.config.js with the flag set (or not) and resolves `name` while the env is in place. */
  function resolveWith(flag: string | undefined, name: string) {
    const saved = process.env.EXPO_PUBLIC_E2E_STUB_AUTH;
    if (flag === undefined) delete process.env.EXPO_PUBLIC_E2E_STUB_AUTH;
    else process.env.EXPO_PUBLIC_E2E_STUB_AUTH = flag;
    try {
      let config!: {
        resolver: { resolveRequest: (...a: unknown[]) => { filePath: string } };
      };
      jest.isolateModules(() => {
        config = require(join(APP, "metro.config.js"));
      });
      return config.resolver.resolveRequest(ctx, name, "web");
    } finally {
      if (saved === undefined) delete process.env.EXPO_PUBLIC_E2E_STUB_AUTH;
      else process.env.EXPO_PUBLIC_E2E_STUB_AUTH = saved;
    }
  }
  const modules = ["@/lib/auth/ClerkAuth", "@clerk/expo/legacy"];

  it.each(modules)("flag unset: %s is NOT resolved to __e2e__", (m) => {
    const out = resolveWith(undefined, m);
    expect(out.filePath).not.toContain("__e2e__");
    expect(out.filePath).toBe(`/real/${m}`);
  });
  it.each(modules)("flag set (permitted context): %s IS the stub", (m) => {
    const out = resolveWith("1", m);
    expect(out.filePath).toContain("__e2e__");
  });
});

describe("package.json scripts and shipped code", () => {
  const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
  it("build:web has no stub flag and runs the assert-no-stub script", () => {
    expect(pkg.scripts["build:web"]).not.toContain("EXPO_PUBLIC_E2E_STUB_AUTH");
    expect(pkg.scripts["build:web"]).toContain("assert-no-e2e-stub.mjs dist");
    expect(pkg.scripts["build:web"]).not.toContain("--expect-stub");
  });
  it("build:web:e2e uses the dedicated output dir and expects the stub", () => {
    const s = pkg.scripts["build:web:e2e"];
    expect(s).toContain("--output-dir dist-e2e");
    expect(s).toContain("assert-no-e2e-stub.mjs dist-e2e --expect-stub");
  });
  it("the root layout imports the real provider and never the stub", () => {
    const layout = readFileSync(join(APP, "src", "app", "_layout.tsx"), "utf8");
    expect(layout).toContain('"@/lib/auth/ClerkAuth"');
    expect(layout).not.toContain("__e2e__");
  });
});

describe("scripts/assert-no-e2e-stub.mjs", () => {
  const script = join(APP, "scripts", "assert-no-e2e-stub.mjs");
  function dirWith(content: string) {
    const dir = mkdtempSync(join(tmpdir(), "stubscan-"));
    mkdirSync(join(dir, "_expo"));
    writeFileSync(join(dir, "_expo", "entry.js"), content);
    return dir;
  }
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const MARK = "__NEXTCENT_E2E_STUB_AUTH__";

  it("passes a clean bundle and fails one with the marker (default mode)", () => {
    expect(run(dirWith("console.log(1)")).status).toBe(0);
    const bad = run(dirWith(`globalThis.${MARK}=true`));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("marker was found");
  });
  it("--expect-stub requires the marker", () => {
    expect(run(dirWith(`x="${MARK}"`), "--expect-stub").status).toBe(0);
    const missing = run(dirWith("console.log(1)"), "--expect-stub");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("expected it");
  });
  it("the marker in the script matches the stub source", () => {
    const store = readFileSync(join(APP, "src", "__e2e__", "store.ts"), "utf8");
    expect(store).toContain(MARK);
    expect(readFileSync(script, "utf8")).toContain(MARK);
  });
});
