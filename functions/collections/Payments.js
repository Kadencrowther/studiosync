// Payments Collection Detailed Map
const PAYMENTS_MAP = {
  collection: "Payments",
  description: "Payment records and transactions",
  
  fields: {
    Amount: "number - Total payment amount",
    FamilyId: "string - Associated family ID",
    FamilyName: "string - Family name for reference",
    PaymentDate: "timestamp - When payment was made",
    Status: "string - Payment status (e.g., 'Paid', 'Failed')",
    Description: "string - Payment description",
    PaymentMethod: "object - Payment method details",
    ProcessingFee: "string - Fee for processing payment",
    Subtotal: "number - Amount before fees",
    IsPartialPayment: "boolean - Whether it's a partial payment",
    LineItems: "array - Detailed payment items",
    RequestedAmount: "number - Original amount requested",
    UpdatedBalance: "number - Balance after payment",
    Type: "string - Type of payment",
    CreatedAt: "timestamp - When payment was created"
  },
  
  commonQueries: [
    "Recent payments",
    "Monthly revenue totals",
    "Failed payments",
    "Payments by family",
    "Payment history"
  ],
  
  queryPatterns: {
    recentPayments: {
      type: "list",
      orderBy: {"field": "PaymentDate", "direction": "desc"},
      limit: 20,
      description: "Get most recent payments"
    },
    monthlyRevenue: {
      type: "sum",
      field: "Amount",
      filters: [
        {"field": "PaymentDate", "operator": ">=", "value": "MONTH_START"},
        {"field": "PaymentDate", "operator": "<", "value": "MONTH_END"},
        {"field": "Status", "operator": "==", "value": "Paid"}
      ]
    },
    failedPayments: {
      type: "list",
      filters: [{"field": "Status", "operator": "==", "value": "Failed"}]
    },
    familyPayments: {
      type: "list",
      filters: [{"field": "FamilyId", "operator": "==", "value": "FAMILY_ID"}],
      orderBy: {"field": "PaymentDate", "direction": "desc"}
    }
  },
  
  relationships: {
    "Families": "Connected via FamilyId field",
    "Charges": "Payments applied to charges"
  }
};

module.exports = PAYMENTS_MAP; 