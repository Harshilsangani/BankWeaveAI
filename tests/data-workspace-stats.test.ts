import test from "node:test";
import assert from "node:assert/strict";
import { formatAddedProfiles, formatStat } from "../features/data-workspace/stats";

test("directory stats format numbers and fall back when values are missing", () => {
  assert.equal(formatStat(1234567), (1234567).toLocaleString());
  assert.equal(formatStat(0), (0).toLocaleString());
  assert.equal(formatStat(undefined), "—");
  assert.equal(formatStat(null), "—");
  assert.equal(formatStat(NaN), "—");
});

test("added profiles tolerate a missing or partial stats object", () => {
  assert.equal(formatAddedProfiles(undefined), "—");
  assert.equal(formatAddedProfiles(null), "—");
  assert.equal(formatAddedProfiles({ manual: 2, uploaded: 3 }), (5).toLocaleString());
  assert.equal(formatAddedProfiles({} as { manual?: number; uploaded?: number }), (0).toLocaleString());
  assert.equal(
    formatAddedProfiles({ manual: undefined, uploaded: 4 }),
    (4).toLocaleString()
  );
});
