import type { Account, Branch, Customer, FraudAlert, Loan, Policy, Transaction } from "@/types";

// Deterministic fixture. All identifiers and records are synthetic.
export type Month = "Apr" | "May" | "Jun" | "Jul" | "Aug" | "Sep";
export const months: Month[] = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
export const snapshotMonth: Month = "Sep";
export const baselineMonth: Month = "Aug";
/** Rejects anything outside the six snapshot months. Use at every trust boundary. */
export function parseMonth(value: unknown): Month {
  if (typeof value === "string" && (months as string[]).includes(value)) return value as Month;
  throw new Error(`Unknown month "${String(value)}". Expected one of ${months.join(", ")}.`);
}
export const snapshot = "30 Sep 2026";
export const branches: Branch[] = [
  { id: "BR-AHM", name: "Ahmedabad Central", region: "Ahmedabad" },
  { id: "BR-SUR", name: "Surat City", region: "Surat" },
  { id: "BR-MUM", name: "Mumbai Fort", region: "Mumbai" },
  { id: "BR-BLR", name: "Bengaluru MG Road", region: "Bengaluru" },
];
const firstNames = [
  "Aarav",
  "Aditi",
  "Arjun",
  "Ananya",
  "Dev",
  "Diya",
  "Ishaan",
  "Isha",
  "Kabir",
  "Kavya",
  "Neel",
  "Nisha",
  "Om",
  "Priya",
  "Rohan",
  "Riya",
  "Samar",
  "Sneha",
  "Varun",
  "Vidya",
  "Aditya",
  "Meera",
  "Kunal",
  "Tara",
  "Nikhil",
  "Pooja",
  "Rahul",
  "Sana",
  "Vivek",
  "Zoya",
  "Yash",
  "Anika",
];
const lastNames = [
  "Shah",
  "Patel",
  "Mehta",
  "Desai",
  "Joshi",
  "Rao",
  "Nair",
  "Iyer",
  "Menon",
  "Kapoor",
  "Sharma",
  "Verma",
  "Gupta",
  "Reddy",
  "Singh",
  "Kumar",
  "Bose",
  "Sen",
  "Das",
  "Roy",
  "Bhat",
  "Naik",
  "Shetty",
  "Kulkarni",
  "Mishra",
  "Sethi",
  "Malhotra",
  "Chopra",
  "Khanna",
  "Jain",
  "Saxena",
  "Agarwal",
  "Sinha",
  "Pandey",
  "Trivedi",
  "Bhatt",
  "Thakur",
  "Chauhan",
  "Ghosh",
  "Pillai",
];
export const TOTAL_CUSTOMERS = 10000;
const ORIGINAL_CUSTOMERS = 1200;
// Extended pools are appended so the first 1,200 identities never change.
const extraFirstNames = [
  "Aisha", "Arnav", "Avni", "Dhruv", "Esha", "Farhan", "Gauri", "Harsh",
  "Ira", "Jai", "Karan", "Lakshmi", "Manav", "Navya", "Ojas", "Parth",
  "Qureshi", "Radhika", "Sahil", "Tanvi", "Uday", "Vaibhav", "Wridhi", "Xavier",
  "Yamini", "Zara", "Amit", "Bhavna", "Chetan", "Deepika", "Eklavya", "Falak",
  "Girish", "Heena", "Imran", "Jaya", "Kiran", "Leena", "Mohan", "Naina",
];
const extraLastNames = [
  "Acharya", "Bakshi", "Chawla", "Dube", "Easwaran", "Fernandes", "Gill", "Hegde",
  "Irani", "Jadhav", "Kaul", "Lakhani", "Mahajan", "Nambiar", "Oberoi", "Parikh",
  "Qazi", "Rastogi", "Saluja", "Talwar", "Upadhyay", "Vohra", "Wadhwa", "Yadav",
  "Zaidi", "Anand", "Bhandari", "Chaturvedi", "Dixit", "Elangovan", "Fadnavis", "Gokhale",
  "Haldar", "Iqbal", "Jhaveri", "Khandelwal", "Lodha", "Mukherjee", "Narayan", "Purohit",
];
const allFirstNames = [...firstNames, ...extraFirstNames];
const allLastNames = [...lastNames, ...extraLastNames];
function customerName(i: number): string {
  // Preserve every original identity byte-for-byte.
  if (i < ORIGINAL_CUSTOMERS)
    return `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length)]}`;
  return `${allFirstNames[(i * 7 + 3) % allFirstNames.length]} ${allLastNames[(i * 13 + 5) % allLastNames.length]}`;
}
export const customers: Customer[] = Array.from({ length: TOTAL_CUSTOMERS }, (_, i) => ({
  id: `CUS-${String(i + 1).padStart(5, "0")}`,
  fullName: customerName(i),
  dateOfBirth: `${[1993, 1983, 1973, 1958][Math.floor(i / 4) % 4] + (Math.floor(i / 16) % 8)}-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
  email: `customer${String(i + 1).padStart(5, "0")}@customers.example.test`,
  phone: "",
  address: `${(i % 300) + 1} Demo Avenue`,
  city: branches[i % 4].region,
  state: ["Gujarat", "Gujarat", "Maharashtra", "Karnataka"][i % 4],
  postalCode: ["380001", "395003", "400001", "560001"][i % 4],
  branchId: branches[i % 4].id,
  ageGroup: ["25–34", "35–44", "45–54", "55+"][Math.floor(i / 4) % 4],
  occupation: ["Salaried", "Self-employed", "Business owner"][i % 3],
  creditScore: 540 + ((i * 37) % 310),
}));
export const accounts: Account[] = customers.map((c, i) => ({
  id: `ACC-${String(i + 1).padStart(5, "0")}`,
  customerId: c.id,
  type: i % 4 ? "Savings" : "Current",
  balance: 32000 + ((i * 419) % 1800000),
}));
const fraudDistribution = [
  [26, 20, 17, 11],
  [29, 23, 17, 11],
  [28, 20, 18, 11],
  [33, 24, 20, 11],
  [40, 25, 23, 12],
  [78, 25, 18, 10],
];
const ORIGINAL_TX_PER_MONTH = 2400;
const NEW_CUSTOMERS = TOTAL_CUSTOMERS - ORIGINAL_CUSTOMERS;
const NEW_TX_PER_MONTH = NEW_CUSTOMERS * 2;
// Scaled fraud flags for the 8,800 newer customers: same per-branch monthly
// rates as the original snapshot, rounded to whole flags.
const extraFraudDistribution = [
  [191, 147, 125, 81],
  [213, 169, 125, 81],
  [205, 147, 132, 81],
  [242, 176, 147, 81],
  [293, 183, 169, 88],
  [572, 183, 132, 73],
];
function buildOriginalTransactions(month: Month, m: number) {
  return Array.from({ length: ORIGINAL_TX_PER_MONTH }, (_, i) => {
    const b = i % 4;
    const position = Math.floor(i / 4);
    const flagged = position < fraudDistribution[m][b];
    const newDevice = flagged
      ? position < Math.floor(fraudDistribution[m][b] * (m === 5 && b === 0 ? 0.82 : 0.35))
      : position % 11 === 0;
    const customer = customers[(i + m * 16) % ORIGINAL_CUSTOMERS];
    return {
      id: `TX-${m + 4}${String(i + 1).padStart(5, "0")}`,
      accountId: accounts[(i + m * 16) % ORIGINAL_CUSTOMERS].id,
      customerId: customer.id,
      branchId: branches[b].id,
      month,
      timestamp: `2026-${String(m + 4).padStart(2, "0")}-${String((position % 28) + 1).padStart(2, "0")}T${String(position % 24).padStart(2, "0")}:32:00+05:30`,
      amount: flagged
        ? 70000 + ((position * 7919 + b * 3301) % 145000)
        : 200 + ((i * 173 + m * 811) % 75000),
      channel: newDevice ? "Online" : ["POS", "Online", "UPI"][position % 3],
      merchantCategory:
        newDevice && b === 0
          ? "Electronics"
          : ["Retail", "Travel", "Groceries", "Electronics"][position % 4],
      deviceId:
        newDevice && flagged && b === 0 ? `DEV-CLUSTER-${(position % 7) + 1}` : `DEV-${i + 1}`,
      newDevice,
      flagged,
      riskScore: flagged ? 76 + (position % 23) : 12 + (position % 49),
    };
  });
}
function buildExtendedTransactions(month: Month, m: number) {
  return Array.from({ length: NEW_TX_PER_MONTH }, (_, j) => {
    const b = j % 4;
    const position = Math.floor(j / 4);
    const flagged = position < extraFraudDistribution[m][b];
    const newDevice = flagged
      ? position < Math.floor(extraFraudDistribution[m][b] * (m === 5 && b === 0 ? 0.82 : 0.35))
      : position % 11 === 0;
    // 1200 % 4 and 16 % 4 are both 0, so the branch always matches the owner.
    const customerIndex = ORIGINAL_CUSTOMERS + ((j + m * 16) % NEW_CUSTOMERS);
    const customer = customers[customerIndex];
    return {
      id: `TX-${m + 4}${String(ORIGINAL_TX_PER_MONTH + j + 1).padStart(5, "0")}`,
      accountId: accounts[customerIndex].id,
      customerId: customer.id,
      branchId: branches[b].id,
      month,
      timestamp: `2026-${String(m + 4).padStart(2, "0")}-${String((position % 28) + 1).padStart(2, "0")}T${String(position % 24).padStart(2, "0")}:32:00+05:30`,
      amount: flagged
        ? 70000 + ((position * 7919 + b * 3301) % 145000)
        : 200 + (((ORIGINAL_TX_PER_MONTH + j) * 173 + m * 811) % 75000),
      channel: newDevice ? "Online" : ["POS", "Online", "UPI"][position % 3],
      merchantCategory:
        newDevice && b === 0
          ? "Electronics"
          : ["Retail", "Travel", "Groceries", "Electronics"][position % 4],
      deviceId:
        newDevice && flagged && b === 0
          ? `DEV-CLUSTER-${(position % 7) + 1}`
          : `DEV-${ORIGINAL_TX_PER_MONTH + j + 1}`,
      newDevice,
      flagged,
      riskScore: flagged ? 76 + (position % 23) : 12 + (position % 49),
    };
  });
}
export const transactions: Transaction[] = months.flatMap((month, m) => [
  ...buildOriginalTransactions(month, m),
  ...buildExtendedTransactions(month, m),
]);
const loanDefaultCounts = [
  [14, 11, 10, 9],
  [16, 12, 10, 10],
  [19, 13, 12, 10],
  [24, 14, 13, 10],
  [29, 17, 15, 11],
  [40, 18, 16, 11],
];
function buildLoan(g: number, customerIndex: number): Loan {
  const b = g % 4;
  // Cycle every 960 loans so new lending keeps the original default rates.
  const row = Math.floor(g / 4) % 240;
  return {
    id: `LN-${String(g + 1).padStart(5, "0")}`,
    customerId: customers[customerIndex].id,
    branchId: branches[b].id,
    type: row % 3 === 0 ? "Secured" : "Unsecured",
    amount: 150000 + ((g * 6571) % 2500000),
    defaultMonths: months.filter((_, m) => row < loanDefaultCounts[m][b]),
  };
}
export const loans: Loan[] = [
  // Original 960 loans are unchanged: customer i holds loan i.
  ...Array.from({ length: 960 }, (_, i) => buildLoan(i, i)),
  // 7,040 further loans for customers CUS-01201..CUS-08240 (80% take-up, as before).
  // 1200 % 4 and 960 % 4 are both 0, so each loan branch matches its owner.
  ...Array.from({ length: 7040 }, (_, k) => buildLoan(960 + k, ORIGINAL_CUSTOMERS + k)),
];
export const fraudAlerts: FraudAlert[] = transactions
  .filter((t) => t.flagged)
  .map((t) => ({
    id: `FA-${t.id}`,
    transactionId: t.id,
    reason: t.newDevice ? "New device and elevated transaction risk" : "Elevated transaction risk",
    status: "Needs review",
  }));
export const policies: Policy[] = [
  {
    id: "POL-FR-01",
    title: "Suspicious transaction escalation",
    category: "Fraud operations",
    version: "Demo v1.2",
    summary:
      "An evidence-first workflow for reviewing transaction alerts and escalating potential fraud.",
    sections: [
      "Validate the alert against transaction history and device signals. A risk score alone is not confirmation of fraud.",
      "Document affected transaction IDs, monetary exposure, observation window, and alternative explanations.",
      "Refer high-severity cases to a human risk reviewer. Account restrictions require separate authorized approval.",
      "Preserve an audit record of evidence and review decisions. This synthetic policy is for demonstration only.",
    ],
  },
  {
    id: "POL-KYC-02",
    title: "KYC review & documentation",
    category: "Customer diligence",
    version: "Demo v1.0",
    summary: "Required evidence and review stages for a customer due-diligence escalation.",
    sections: [
      "Verify the completeness of the synthetic customer record and document missing information.",
      "Escalate discrepancies to the designated compliance reviewer with supporting evidence.",
      "Do not infer identity or eligibility from demographic characteristics. This is a fictional demonstration policy, not regulatory guidance.",
    ],
  },
  {
    id: "POL-CR-03",
    title: "Credit risk monitoring",
    category: "Credit risk",
    version: "Demo v1.1",
    summary: "Monitor default concentration by branch, product, and repayment behavior.",
    sections: [
      "Compare rates using the same population definition and reporting window.",
      "Review product and regional concentration before proposing interventions.",
      "Scenario outputs are model estimates; lending decisions require human review. Demo policy only.",
    ],
  },
];
