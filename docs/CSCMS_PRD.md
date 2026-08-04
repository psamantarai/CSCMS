# Rural Service Center Management System (RSCMS)

## Product Requirements Document (PRD)

**Version:** 1.1\
**Platform:** Offline-first Desktop Application\
**Frontend:** React 19 + Vite + TypeScript\
**Backend:** Python FastAPI\
**Database:** SQLite\
**Desktop Runtime:** Electron

> **v1.1 change:** the frontend is React, not Angular. The UI was built in
> Figma Make as a React prototype before implementation began; keeping it
> avoids rebuilding nine finished screens for no product gain. See
> `ARCHITECTURE.md` for the technical design and `PLAN.md` for the build
> sequence.

------------------------------------------------------------------------

# 1. Vision

Build an offline-first desktop application for rural service centers
(CSC/Jan Seva Kendra/Kiosk Banking) that serves as the complete
operational system for the business. The application should manage
customers, services, banking transactions, printing jobs, expenses,
income, and a financial ledger while tracking multiple cash and bank
accounts with daily opening and closing balances.

------------------------------------------------------------------------

# 2. Business Goals

-   Replace paper registers and Excel sheets.
-   Provide complete customer and transaction history.
-   Automatically maintain a financial ledger.
-   Track balances across multiple accounts.
-   Produce daily, monthly and yearly reports.
-   Enable reliable backups and future cloud synchronization.

------------------------------------------------------------------------

# 3. Core Modules

## Dashboard

-   Today's Income
-   Today's Expenses
-   Today's Profit
-   Cash in Hand
-   Total Bank Balance
-   Pending Credits
-   Today's Customers
-   Daily Closing Status

## Customers

-   Customer profile
-   Contact details
-   Service history
-   Banking history
-   Outstanding balance

## Services

Examples: - PAN - Aadhaar - Certificates - Utility Payments - Ticket
Booking - Printing - Banking - Custom services

## Transactions

Every customer activity becomes a transaction containing: - Customer -
Service - Fees - Service charge - Discount - Payment - Pending amount -
Operator - Attachments

## Banking

Supports: - Withdrawals - Deposits - AEPS - Money Transfer - Balance
Enquiry - Commission tracking

## Printing

-   Print
-   Scan
-   Photocopy
-   Lamination
-   Passport Photos

## Expenses

-   Rent
-   Internet
-   Electricity
-   Paper
-   Ink
-   Repairs
-   Miscellaneous

## Reports

-   Daily
-   Monthly
-   Customer-wise
-   Service-wise
-   Banking Commission
-   Profit & Loss

------------------------------------------------------------------------

# 4. Financial Ledger

Every financial event automatically creates ledger entries.

Sources: - Service income - Banking commission - Printing income -
Expenses - Refunds - Customer payments - Customer credit

The ledger becomes the single source of truth.

------------------------------------------------------------------------

# 5. Multi-Account Management (Critical)

The shopkeeper may operate multiple accounts.

Examples: - Cash Drawer - SBI Savings - HDFC Current - ICICI Current -
UPI Wallet - AEPS Settlement Account

Each account stores: - Account Name - Account Type - Bank Name - Account
Number (masked) - IFSC - Opening Balance - Current Balance - Status

------------------------------------------------------------------------

# 6. Daily Opening & Closing Balance

For every business day and every account the system shall store:

-   Business Date
-   Account
-   Opening Balance
-   Money Received
-   Money Paid
-   Internal Transfers
-   Manual Adjustment
-   Closing Balance
-   Closing Timestamp
-   Closed By
-   Remarks

Formula:

Closing Balance = Opening Balance + Money Received - Money Paid +
Incoming Transfers - Outgoing Transfers ± Adjustments

The next business day's opening balance is automatically populated from
the previous day's closing balance.

If the previous day is modified, future balances are recalculated.

------------------------------------------------------------------------

# 7. Internal Fund Transfers

Transfer funds between accounts.

Example: Cash -\> SBI SBI -\> HDFC Cash -\> UPI

Each transfer generates two ledger entries: - Debit source account -
Credit destination account

Both accounts remain reconciled.

------------------------------------------------------------------------

# 8. Daily Closing Workflow

1.  Verify pending work
2.  Verify cash
3.  Verify bank balances
4.  Record adjustments
5.  Lock business day
6.  Generate Daily Closing Report

The report includes: - Opening balances - Income - Expenses -
Transfers - Closing balances - Variance

------------------------------------------------------------------------

# 9. Audit & Security

-   Audit trail for edits
-   Soft delete
-   Automatic backups
-   Password-protected login
-   Offline operation
-   Database restore

------------------------------------------------------------------------

# 10. Suggested Database Tables

-   customers
-   services
-   transactions
-   transaction_items
-   accounts
-   daily_account_balance
-   account_transfer
-   ledger
-   payments
-   expenses
-   print_jobs
-   banking_transactions
-   attachments
-   settings
-   audit_logs

------------------------------------------------------------------------

# 11. Future Enhancements

-   Multi-user support
-   Multi-branch support
-   Cloud synchronization
-   SMS/WhatsApp notifications
-   GST reporting
-   Mobile companion application

------------------------------------------------------------------------

# 12. Acceptance Criteria

-   Entire application works without internet.
-   Every financial event updates the ledger automatically.
-   Multiple accounts remain synchronized.
-   Daily opening balances are carried forward automatically.
-   Daily closing reports are generated in one click.
-   Financial reports always reconcile with ledger entries.
