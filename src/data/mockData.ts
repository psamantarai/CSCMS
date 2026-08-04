export const customers = [
  { id: 1, name: "Ramesh Kumar Singh", phone: "9876543210", village: "Khandwa", aadhaar: "XXXX-XXXX-4521", outstanding: 0, lastVisit: "2026-08-04" },
  { id: 2, name: "Sunita Devi Yadav", phone: "9812345678", village: "Piprani", aadhaar: "XXXX-XXXX-7832", outstanding: 250, lastVisit: "2026-08-03" },
  { id: 3, name: "Mohan Lal Patel", phone: "9765432109", village: "Bairagarh", aadhaar: "XXXX-XXXX-1093", outstanding: 0, lastVisit: "2026-08-04" },
  { id: 4, name: "Kavita Sharma", phone: "9823456789", village: "Khandwa", aadhaar: "XXXX-XXXX-6654", outstanding: 100, lastVisit: "2026-08-02" },
  { id: 5, name: "Dinesh Prasad Gupta", phone: "9745678901", village: "Sehore", aadhaar: "XXXX-XXXX-3387", outstanding: 0, lastVisit: "2026-08-04" },
  { id: 6, name: "Rekha Bai Verma", phone: "9867890123", village: "Narsinghpur", aadhaar: "XXXX-XXXX-9921", outstanding: 500, lastVisit: "2026-07-30" },
]

export const transactions = [
  { id: "TXN-1084", customer: "Ramesh Kumar Singh", service: "Aadhaar Update", fees: 100, charge: 50, discount: 0, payment: 150, pending: 0, operator: "Admin", time: "09:15 AM", status: "Completed" },
  { id: "TXN-1085", customer: "Sunita Devi Yadav", service: "PAN Application", fees: 107, charge: 100, discount: 0, payment: 107, pending: 250, operator: "Admin", time: "10:02 AM", status: "Pending" },
  { id: "TXN-1086", customer: "Mohan Lal Patel", service: "Electricity Bill", fees: 1840, charge: 20, discount: 0, payment: 1860, pending: 0, operator: "Admin", time: "10:45 AM", status: "Completed" },
  { id: "TXN-1087", customer: "Kavita Sharma", service: "Passport Photo", fees: 60, charge: 0, discount: 0, payment: 60, pending: 100, operator: "Admin", time: "11:20 AM", status: "Partial" },
  { id: "TXN-1088", customer: "Dinesh Prasad Gupta", service: "AEPS Withdrawal", fees: 3000, charge: 30, discount: 0, payment: 3030, pending: 0, operator: "Admin", time: "12:10 PM", status: "Completed" },
  { id: "TXN-1089", customer: "Walk-in", service: "Photocopy (12 pages)", fees: 12, charge: 0, discount: 0, payment: 12, pending: 0, operator: "Admin", time: "01:05 PM", status: "Completed" },
]

export const accounts = [
  { id: 1, name: "Cash Drawer", type: "Cash", bank: "—", number: "—", balance: 12450, status: "Active" },
  { id: 2, name: "SBI Savings", type: "Savings", bank: "State Bank of India", number: "XXXX 4521", balance: 84320, status: "Active" },
  { id: 3, name: "HDFC Current", type: "Current", bank: "HDFC Bank", number: "XXXX 8803", balance: 32100, status: "Active" },
  { id: 4, name: "UPI Wallet", type: "Wallet", bank: "PhonePe", number: "—", balance: 4500, status: "Active" },
  { id: 5, name: "AEPS Settlement", type: "Settlement", bank: "FingPay", number: "XXXX 7712", balance: 18900, status: "Active" },
]

export const expenses = [
  { id: 1, category: "Internet", amount: 1499, date: "2026-08-01", note: "BSNL Broadband monthly" },
  { id: 2, category: "Electricity", amount: 860, date: "2026-08-01", note: "August bill" },
  { id: 3, category: "Paper", amount: 350, date: "2026-08-03", note: "A4 ream × 5" },
  { id: 4, category: "Ink", amount: 480, date: "2026-08-03", note: "Black cartridge refill" },
  { id: 5, category: "Miscellaneous", amount: 120, date: "2026-08-04", note: "Pen, stapler pins" },
]

export const bankingTransactions = [
  { id: "BNK-201", customer: "Ramesh Kumar Singh", type: "AEPS Withdrawal", amount: 5000, commission: 50, account: "AEPS Settlement", time: "09:30 AM" },
  { id: "BNK-202", customer: "Sunita Devi Yadav", type: "Money Transfer", amount: 8000, commission: 24, account: "SBI Savings", time: "10:15 AM" },
  { id: "BNK-203", customer: "Mohan Lal Patel", type: "Deposit", amount: 10000, commission: 0, account: "SBI Savings", time: "11:00 AM" },
  { id: "BNK-204", customer: "Kavita Sharma", type: "Balance Enquiry", amount: 0, commission: 5, account: "AEPS Settlement", time: "11:45 AM" },
  { id: "BNK-205", customer: "Walk-in", type: "AEPS Withdrawal", amount: 2000, commission: 20, account: "AEPS Settlement", time: "12:30 PM" },
]

export const ledgerEntries = [
  { id: "LED-001", date: "2026-08-04", description: "Aadhaar Update — Ramesh Kumar Singh", debit: 0, credit: 150, account: "Cash Drawer", type: "Service Income" },
  { id: "LED-002", date: "2026-08-04", description: "AEPS Commission — Ramesh Kumar Singh", debit: 0, credit: 50, account: "AEPS Settlement", type: "Commission" },
  { id: "LED-003", date: "2026-08-04", description: "Electricity Bill — Mohan Lal Patel", debit: 0, credit: 1860, account: "Cash Drawer", type: "Service Income" },
  { id: "LED-004", date: "2026-08-04", description: "Paper Purchase", debit: 350, credit: 0, account: "Cash Drawer", type: "Expense" },
  { id: "LED-005", date: "2026-08-04", description: "Transfer: Cash → SBI Savings", debit: 5000, credit: 0, account: "Cash Drawer", type: "Transfer" },
  { id: "LED-006", date: "2026-08-04", description: "Transfer: Cash → SBI Savings", debit: 0, credit: 5000, account: "SBI Savings", type: "Transfer" },
  { id: "LED-007", date: "2026-08-04", description: "AEPS Withdrawal — Dinesh Prasad Gupta", debit: 0, credit: 3030, account: "Cash Drawer", type: "Service Income" },
]
