// Usage: node scripts/assert-no-e2e-stub.mjs <exported-dir> [--expect-stub]
// Scans exported JS for the E2E auth stub marker. Normal builds must NOT contain it (default);
// the E2E build must contain it (--expect-stub). Exit code 1 on violation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const MARKER = "__NEXTCENT_E2E_STUB_AUTH__";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|mjs|cjs|html|map)$/.test(name)) yield p;
  }
}

export function filesWithMarker(dir) {
  return [...walk(dir)].filter((f) => readFileSync(f, "utf8").includes(MARKER));
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("usage: assert-no-e2e-stub.mjs <dir> [--expect-stub]");
  process.exit(2);
}
const expectStub = args.includes("--expect-stub");
const hits = filesWithMarker(dir);
if (expectStub && hits.length === 0) {
  console.error(
    `FAIL: ${dir} does not contain the E2E stub marker (expected it).`,
  );
  process.exit(1);
}
if (!expectStub && hits.length > 0) {
  console.error(
    `FAIL: the E2E auth stub marker was found in ${dir}:\n  ${hits.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(
  `OK: ${dir} ${expectStub ? "contains" : "does not contain"} the E2E stub marker.`,
);
