// Families Collection Detailed Map
const FAMILIES_MAP = {
  collection: "Families",
  description: "Family accounts, billing, and contact information",
  
  fields: {
    FirstName: "string - Primary contact first name",
    LastName: "string - Primary contact last name",
    Email: "string - Primary email address",
    Phone: "string - Contact phone number",
    Address1: "string - Primary address",
    Address2: "string - Secondary address",
    City: "string - City",
    State: "string - State",
    ZipCode: "string - ZIP code",
    Balance: "number - Current account balance",
    IsOnAutoPay: "boolean - Auto-pay enrollment status",
    Students: "array - Associated student IDs",
    PayarcCustomerId: "string - Payment processor ID",
    LastChargeAmount: "number - Most recent charge amount",
    LastChargeDate: "timestamp - Date of last charge",
    LastPayment: "object - Details of most recent payment",
    EmergencyContacts: "array - Emergency contact information",
    CreatedAt: "timestamp - When family was added",
    UpdatedAt: "timestamp - Last update timestamp"
  },
  
  commonQueries: [
    "Families with outstanding balances",
    "Auto-pay enrolled families",
    "Family contact information",
    "Families by student count",
    "Recent family registrations"
  ],
  
  queryPatterns: {
    familiesWithBalance: {
      type: "list",
      filters: [{"field": "Balance", "operator": ">", "value": 0}],
      description: "Families with outstanding balances"
    },
    autopayFamilies: {
      type: "count",
      filters: [{"field": "IsOnAutoPay", "operator": "==", "value": true}],
      description: "Families enrolled in autopay"
    },
    recentFamilies: {
      type: "list",
      orderBy: {"field": "CreatedAt", "direction": "desc"},
      limit: 10,
      description: "Most recently added families"
    },
    allFamilies: {
      type: "list",
      description: "Get all family records"
    }
  },
  
  relationships: {
    "Students": "Connected via Students array field",
    "Charges": "Families receive charges via FamilyId",
    "Payments": "Families make payments via FamilyId"
  }
};

module.exports = FAMILIES_MAP; 