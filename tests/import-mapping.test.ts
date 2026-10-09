import assert from "node:assert/strict";
import { test } from "node:test";
import { errorCsv, suggestMapping } from "../lib/import-mapping";
test("mapping suggests aliases and leaves ambiguous or missing source columns for review", () => {
  const fields = [
    { key: "id", label: "Customer ID", required: true, hint: "" },
    { key: "fullName", label: "Full name", required: true, hint: "" },
    { key: "dateOfBirth", label: "Date of birth", required: true, hint: "" },
  ];
  assert.deepEqual(suggestMapping(fields, ["Customer ID", "Name", "DOB"], "customers"), {
    id: "Customer ID",
    fullName: "Name",
    dateOfBirth: "DOB",
  });
  assert.deepEqual(suggestMapping(fields, ["Name", "Customer Name"], "customers"), {});
});
test("downloaded error CSV quotes separators and keeps original file row numbers", () => {
  assert.equal(
    errorCsv([{ row: 7, reasons: ['Check "amount", then retry.'] }]),
    'row,errors\r\n7,"Check ""amount"", then retry."'
  );
});
