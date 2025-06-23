// Main Database Map - Collection Overview Only
const MAIN_DATABASE_MAP = {
  collections: {
    Students: "Student enrollment and personal information",
    Classes: "Class schedules, capacity, and enrollment", 
    Families: "Family accounts, billing, and contact information",
    Charges: "Billing charges and invoices",
    Payments: "Payment records and transactions",
    Instructors: "Teaching staff information",
    ClassStyles: "Dance/activity style definitions",
    StudioRooms: "Physical studio rooms and spaces",
    Seasons: "Studio seasons and terms",
    Recitals: "Performance events and scheduling",
    Products: "Studio merchandise and retail items",
    RatePlans: "Pricing structures and tuition rates",
    Policies: "Studio policies and agreements",
    Communication: "Messaging and conversation records",
    Discounts: "Discount codes and promotions",
    Fees: "Additional fee structures",
    PaymentProcessing: "Payment system configuration",
    Orders: "Purchase orders and sales",
    Tags: "Organizational labels",
    Users: "Staff and admin accounts",
    SyncSense: "AI conversation history"
  },
  
  // Query classification keywords to determine which collections are needed
  queryKeywords: {
    Students: ["student", "enrollment", "child", "kid", "registered", "active students"],
    Classes: ["class", "schedule", "today", "capacity", "full", "enrollment", "teaching"],
    Families: ["family", "parent", "household", "contact", "balance", "billing"],
    Charges: ["charge", "bill", "invoice", "owe", "unpaid", "outstanding", "balance"],
    Payments: ["payment", "paid", "revenue", "income", "transaction", "money"],
    Instructors: ["instructor", "teacher", "staff", "teaching", "coach"],
    ClassStyles: ["style", "dance", "ballet", "jazz", "hip hop", "type"],
    StudioRooms: ["room", "space", "studio", "location"],
    Seasons: ["season", "term", "semester", "year"],
    Recitals: ["recital", "performance", "show", "event"],
    Products: ["product", "merchandise", "sell", "inventory"],
    RatePlans: ["rate", "price", "tuition", "cost"],
    Policies: ["policy", "rule", "agreement", "waiver"],
    Communication: ["message", "chat", "communication", "conversation"],
    Discounts: ["discount", "promo", "coupon", "sale"],
    Fees: ["fee", "additional", "extra"],
    PaymentProcessing: ["payment processing", "setup", "config"],
    Orders: ["order", "purchase", "sale"],
    Tags: ["tag", "label", "category"],
    Users: ["user", "admin", "staff", "login"],
    SyncSense: ["conversation", "chat history", "ai"]
  }
};

module.exports = MAIN_DATABASE_MAP; 