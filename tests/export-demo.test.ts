import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("fixture export honors the storage path and preserves restored bytes", () => {
  const storage = mkdtempSync(join(tmpdir(), "bankweave-fixture-"));
  const fixture = join(storage, "meridian.json");
  const exportFixture = () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/export-demo.ts"], {
      env: { ...process.env, RISKLENS_STORAGE_DIR: storage },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    exportFixture();
    const generated = JSON.parse(readFileSync(fixture, "utf8"));
    assert.equal(generated.customers.length, 10000);
    assert.equal(generated.transactions.length, 120000);
    const restored = Buffer.from('{"restoredFixture":"preserve exact bytes"}\n');
    writeFileSync(fixture, restored);
    exportFixture();
    assert.deepEqual(readFileSync(fixture), restored);
  } finally {
    rmSync(storage, { recursive: true, force: true });
  }
});
