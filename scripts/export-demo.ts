import { mkdirSync, writeFileSync } from "node:fs";
import { branches, customers, accounts, transactions, fraudAlerts, loans, policies } from "../data/banking";
mkdirSync("backend/storage", { recursive: true });
writeFileSync(
  "backend/storage/meridian.json",
  JSON.stringify({ branches, customers, accounts, transactions, fraudAlerts, loans, policies })
);
console.log("Exported the coherent Meridian fraud fixture for SQLite seeding.");
