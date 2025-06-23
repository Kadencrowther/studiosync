// Charges Collection Detailed Map
const CHARGES_MAP = {
  collection: "Charges",
  description: "Billing charges and invoices",
  
  fields: {
    Amount: "number - Total charge amount",
    AmountPaid: "number - Amount that has been paid",
    FamilyId: "string - Associated family ID",
    Status: "string - Payment status (e.g., 'Paid', 'Unpaid')",
    Description: "string - Charge description",
    ChargeDate: "string - Date charge was created",
    Month: "number - Billing month (1-12)",
    Year: "number - Billing year",
    Type: "string - Type of charge (e.g., 'MonthlyCharge', 'RegistrationFee')",
    LineItems: "array - List of charge items with details",
    Subtotal: "number - Charge amount before fees",
    ProcessingFee: "number - Payment processing fee",
    UpdatedBalance: "number - Current balance after charge",
    PaymentDate: "timestamp - When payment was made",
    PaymentId: "string - Associated payment ID",
    CreatedAt: "timestamp - When charge was created",
    UpdatedAt: "timestamp - Last update timestamp"
  },
  
  commonQueries: [
    "Unpaid charges/invoices",
    "Monthly billing totals",
    "Charges by family",
    "Outstanding balances",
    "Recent charges"
  ],
  
  queryPatterns: {
    unpaidCharges: {
      type: "list",
      filters: [{"field": "Status", "operator": "!=", "value": "Paid"}],
      description: "Get all unpaid charges"
    },
    monthlyCharges: {
      type: "list",
      filters: [
        {"field": "Month", "operator": "==", "value": "MONTH"},
        {"field": "Year", "operator": "==", "value": "YEAR"}
      ],
      description: "Get charges for specific month/year"
    },
    familyCharges: {
      type: "list",
      filters: [{"field": "FamilyId", "operator": "==", "value": "FAMILY_ID"}],
      description: "Get all charges for a specific family"
    },
    monthlyTotal: {
      type: "sum",
      field: "Amount",
      filters: [
        {"field": "Month", "operator": "==", "value": "MONTH"},
        {"field": "Year", "operator": "==", "value": "YEAR"}
      ],
      description: "Total charges for a month"
    }
  },
  
  relationships: {
    "Families": "Connected via FamilyId field",
    "Payments": "Charges are paid through payment records"
  }
};

module.exports = CHARGES_MAP; 