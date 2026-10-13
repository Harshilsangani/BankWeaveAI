import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  branches,
  customers,
  accounts,
  transactions,
  fraudAlerts,
  loans,
  policies,
} from "../data/banking";
const storage = process.env.RISKLENS_STORAGE_DIR || "backend/storage";
const fixture = join(storage, "meridian.json");
if (existsSync(fixture)) {
  console.log("Preserved the existing Meridian fixture; no file was overwritten.");
} else {
  mkdirSync(storage, { recursive: true });
  writeFileSync(
    fixture,
    JSON.stringify({ branches, customers, accounts, transactions, fraudAlerts, loans, policies }),
    { flag: "wx" }
  );
  console.log("Exported the coherent Meridian fraud fixture for SQLite seeding.");
}
