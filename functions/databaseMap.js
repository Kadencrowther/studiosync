// Database Structure Map for StudioSync
const DATABASE_MAP = {
  collections: {
    Studios: {
      description: "Root collection containing all studios",
      fields: {
        StudioName: "string - Name of the studio",
        PrimaryColor: "string - Studio's primary brand color",
        SecondaryColor: "string - Studio's secondary brand color",
        LogoUrl: "string - URL to studio's logo",
        AccountIsActive: "boolean - Whether the studio account is active",
        BillingPeriod: "string - Billing frequency (e.g., 'monthly')",
        CreatedAt: "timestamp - When studio was created",
        Industry: "string - Type of studio (e.g., 'Dance, Music, Art, etc.')",
        OrganizationSetupCompleted: "boolean - Setup status",
        OwnerEmail: "string - Studio owner's email",
        OwnerFirstName: "string - Studio owner's first name",
        OwnerLastName: "string - Studio owner's last name",
        OwnerPhoneNumber: "string - Studio owner's phone",
        PayarcCustomerId: "string - Payment processor customer ID",
        StudioAddress1: "string - Studio's primary address",
        StudioAddress2: "string - Studio's secondary address",
        StudioCity: "string - Studio's city",
        StudioState: "string - Studio's state",
        StudioZip: "string - Studio's ZIP code",
        SubscriptionPlan: "string - Studio's subscription level",
        TermsAccepted: "boolean - Terms acceptance status",
        TermsAcceptedDate: "timestamp - When terms were accepted",
        UpdatedAt: "timestamp - Last update timestamp"
      },
      subCollections: {
        Charges: {
          description: "Financial charges for the studio",
          queryKeywords: ["charge", "bill", "invoice", "owe", "debt", "balance", "financial", "money", "cost", "fee", "unpaid", "outstanding"],
          fields: {
            Amount: "number - Total charge amount",
            AmountPaid: "number - Amount that has been paid",
            ChargeDate: "string - Date charge was created",
            CreatedAt: "timestamp - When charge was created",
            Description: "string - Charge description",
            FamilyId: "string - Associated family ID",
            LineItems: "array - List of charge items with amount, description, studentId, studentName, type",
            Month: "number - Billing month",
            PaymentDate: "timestamp - When payment was made",
            PaymentId: "string - Associated payment ID",
            ProcessingFee: "number - Payment processing fee",
            Status: "string - Payment status (e.g., 'Paid')",
            Subtotal: "number - Charge amount before fees",
            Type: "string - Type of charge (e.g., 'MonthlyCharge')",
            UpdatedAt: "timestamp - Last update timestamp",
            UpdatedBalance: "number - Current balance",
            Year: "number - Billing year"
          },
          commonFilters: {
            "Status": ["Paid", "Unpaid", "Pending"],
            "Type": ["MonthlyCharge", "RegistrationFee", "ProductSale"],
            "Month": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "Year": "number range"
          },
          queryPatterns: {
            "unpaid_charges": {
              filters: [{"field": "Status", "operator": "!=", "value": "Paid"}],
              description: "Get all unpaid charges"
            },
            "monthly_charges": {
              filters: [{"field": "Month", "operator": "==", "value": "{month}"}, {"field": "Year", "operator": "==", "value": "{year}"}],
              description: "Get charges for specific month/year"
            },
            "family_charges": {
              filters: [{"field": "FamilyId", "operator": "==", "value": "{familyId}"}],
              description: "Get all charges for a family"
            }
          }
        },
        ClassCalendar: {
          description: "Calendar settings for classes",
          queryKeywords: ["calendar", "schedule", "hours", "time", "availability"],
          fields: {
            EndHour: "number - End time for class schedule",
            LastUpdated: "timestamp - Last calendar update",
            StartHour: "number - Start time for class schedule"
          }
        },
        ClassStyles: {
          description: " Activity style definitions",
          queryKeywords: ["style", "dance", "genre", "type", "ballet", "jazz", "hip hop", "contemporary"],
          fields: {
            StyleName: "string - Name of the class style",
            Description: "string - Style description",
            CreatedAt: "timestamp - When style was created"
          },
          queryPatterns: {
            "all_styles": {
              description: "Get all available class styles"
            }
          }
        },
        Classes: {
          description: "Class definitions and schedules",
          queryKeywords: ["class", "classes", "full", "capacity", "enrollment", "schedule", "teaching", "lesson"],
          fields: {
            ClassName: "string - Name of the class",
            ClassNotes: "string - Additional notes",
            ClassStyleId: "string - Reference to style definition",
            ClassType: "string - Type (e.g., 'Recreational')",
            Days: "array - Days of week class meets",
            Description: "string - Detailed description",
            Duration: "number - Length in minutes",
            StartTime: "string - Start time (24h format)",
            EndTime: "string - End time (24h format)",
            EnforceAgeLimit: "boolean - Whether to enforce age restrictions",
            Fee: "array - Fee structure",
            InstructorId: "string - Assigned instructor",
            MaxAge: "number - Maximum student age",
            MinAge: "number - Minimum student age",
            MaxSize: "number - Maximum class size",
            PaymentType: "string - Payment structure",
            RatePlanId: "string - Associated rate plan",
            RoomId: "string - Assigned room",
            SeasonId: "string - Associated season",
            Students: "array - List of enrolled student IDs",
            CreatedAt: "timestamp - Creation timestamp",
            UpdatedAt: "timestamp - Last update timestamp"
          },
          commonFilters: {
            "Days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            "ClassType": ["Recreational", "Competitive", "Adult"],
            "EnforceAgeLimit": [true, false]
          },
          queryPatterns: {
            "classes_by_day": {
              filters: [{"field": "Days", "operator": "array-contains", "value": "{day}"}],
              description: "Get classes on specific day"
            },
            "full_classes": {
              description: "Classes at capacity (Students.length >= MaxSize)"
            },
            "available_classes": {
              description: "Classes with available spots (Students.length < MaxSize)"
            }
          }
        },
        Communication: {
          description: "Messaging and communication records",
          queryKeywords: ["message", "chat", "communication", "conversation", "text", "send"],
          fields: {
            CommunicationType: "string - Type of communication (e.g., 'two-way')",
            CreatedAt: "timestamp - When conversation started",
            CreatedBy: "string - User who created conversation",
            GroupType: "string - Type if group chat (e.g., 'class')",
            Members: "array - List of participant IDs",
            Name: "string - Conversation name",
            Type: "string - Chat type (e.g., 'group', 'dm')"
          },
          subCollections: {
            Messages: {
              description: "Individual messages in a conversation",
              fields: {
                Content: "string - Message content",
                SenderId: "string - ID of message sender",
                SenderName: "string - Name of message sender",
                Timestamp: "timestamp - When message was sent"
              }
            }
          },
          queryPatterns: {
            "recent_conversations": {
              orderBy: {"field": "CreatedAt", "direction": "desc"},
              description: "Get most recent conversations"
            }
          }
        },
        Discounts: {
          description: "Discount codes and promotions",
          queryKeywords: ["discount", "promo", "code", "coupon", "sale", "promotion", "offer"],
          fields: {
            Amount: "number - Discount amount",
            AssociationItemId: "string - Associated item ID",
            AssociationType: "string - Type of association",
            DiscountCode: "string - Code to apply discount",
            DiscountType: "string - Type (e.g., 'Percentage')",
            IsActive: "boolean - Whether discount is active",
            Name: "string - Discount name",
            CreatedAt: "timestamp - Creation timestamp",
            UpdatedAt: "timestamp - Last update timestamp"
          },
          commonFilters: {
            "IsActive": [true, false],
            "DiscountType": ["Percentage", "Fixed", "Dollar"]
          },
          queryPatterns: {
            "active_discounts": {
              filters: [{"field": "IsActive", "operator": "==", "value": true}],
              description: "Get all active discounts"
            }
          }
        },
        Families: {
          description: "Family records and billing units",
          queryKeywords: ["family", "families", "parent", "guardian", "household", "billing", "account", "contact"],
          fields: {
            AdditionalDetails: "string - Extra information",
            Address1: "string - Primary address",
            Address2: "string - Secondary address",
            Balance: "number - Current account balance",
            CardDetails: "array - Payment methods with card info",
            City: "string - City",
            Email: "string - Primary email",
            EmergencyContacts: "array - Emergency contact info",
            FirstName: "string - Primary contact first name",
            LastName: "string - Primary contact last name",
            IsOnAutoPay: "boolean - Auto-pay enrollment status",
            LastChargeAmount: "number - Most recent charge amount",
            LastChargeDate: "timestamp - Date of last charge",
            LastPayment: "map - Details of most recent payment",
            PayarcCustomerId: "string - Payment processor ID",
            Phone: "string - Contact phone",
            PolicyAgreements: "array - Agreed policies",
            ReferredBy: "string - Referral source",
            SignatureInfo: "map - Legal signature details",
            State: "string - State",
            Students: "array - Associated student IDs",
            ZipCode: "string - ZIP code",
            CreatedAt: "timestamp - When family was added",
            UpdatedAt: "timestamp - Last update timestamp"
          },
          commonFilters: {
            "IsOnAutoPay": [true, false],
            "Balance": "number range"
          },
          queryPatterns: {
            "autopay_families": {
              filters: [{"field": "IsOnAutoPay", "operator": "==", "value": true}],
              description: "Families enrolled in autopay"
            },
            "families_with_balance": {
              filters: [{"field": "Balance", "operator": ">", "value": 0}],
              description: "Families with outstanding balance"
            }
          }
        },
        Fees: {
          description: "Fee definitions and structures",
          queryKeywords: ["fee", "cost", "price", "charge", "rate", "pricing"],
          fields: {
            Amount: "number - Fee amount",
            AssociationItemId: "string - Associated item (e.g., season)",
            AssociationType: "string - Type of association",
            FeeType: "string - Type of fee (e.g., 'OneTime')",
            IsActive: "boolean - Whether fee is active",
            Name: "string - Fee name",
            CreatedAt: "timestamp - Creation timestamp",
            UpdatedAt: "timestamp - Last update timestamp"
          },
          commonFilters: {
            "IsActive": [true, false],
            "FeeType": ["OneTime", "Monthly", "Annual"]
          }
        },
        FunctionLogs: {
          description: "System function execution logs",
          queryKeywords: ["log", "error", "system", "function", "execution", "debug"],
          fields: {
            CompletedAt: "string - Completion timestamp",
            Details: "map - Execution details",
            Logs: "array - Log entries with messages and timestamps"
          }
        },
        Instructors: {
          description: "All instructors teaching at the studio",
          queryKeywords: ["instructor", "teacher", "staff", "teaching", "coach"],
          fields: {
            FirstName: "string - Instructor's first name",
            LastName: "string - Instructor's last name",
            Email: "string - Instructor's email",
            Active: "boolean - Whether instructor is currently active",
            Phone: "string - Instructor's phone number"
          },
          commonFilters: {
            "Active": [true, false]
          },
          queryPatterns: {
            "active_instructors": {
              filters: [{"field": "Active", "operator": "==", "value": true}],
              description: "Currently active instructors"
            }
          }
        },
        Orders: {
          description: "Purchase orders",
          queryKeywords: ["order", "purchase", "buy", "sale", "transaction"]
        },
        PaymentProcessing: {
          description: "Payment processing configuration",
          queryKeywords: ["payment", "processing", "config", "setup", "payarc"],
          fields: {
            BusinessInfo: "map - Business details",
            Documents: "map - Required documentation",
            General: "map - General settings including autopay configuration",
            Payarc: "map - Payment processor configuration",
            IsActive: "boolean - Whether processing is active",
            UpdatedAt: "timestamp - Last update timestamp"
          }
        },
        Payments: {
          description: "Payment records",
          queryKeywords: ["payment", "paid", "transaction", "revenue", "income", "receipt"],
          fields: {
            Amount: "number - Payment amount",
            CreatedAt: "timestamp - When payment was created",
            Description: "string - Payment description",
            FamilyId: "string - Associated family ID",
            FamilyName: "string - Family name for reference",
            IsPartialPayment: "boolean - Whether it's a partial payment",
            LineItems: "array - Detailed payment items",
            PayarcChargeId: "string - Payment processor charge ID",
            PaymentDate: "timestamp - When payment was made",
            PaymentMethod: "map - Payment method details",
            ProcessingFee: "string - Fee for processing payment",
            RequestedAmount: "number - Original amount requested",
            Status: "string - Payment status (e.g., 'Paid')",
            Subtotal: "number - Amount before fees",
            Type: "string - Type of payment",
            UpdatedBalance: "number - Balance after payment"
          },
          commonFilters: {
            "Status": ["Paid", "Failed", "Pending"],
            "IsPartialPayment": [true, false]
          },
          queryPatterns: {
            "recent_payments": {
              orderBy: {"field": "PaymentDate", "direction": "desc"},
              description: "Most recent payments"
            },
            "failed_payments": {
              filters: [{"field": "Status", "operator": "==", "value": "Failed"}],
              description: "Failed payment attempts"
            }
          }
        },
        Policies: {
          description: "Studio policies",
          queryKeywords: ["policy", "rule", "agreement", "terms", "waiver"]
        },
        Products: {
          description: "Studio products/merchandise",
          queryKeywords: ["product", "merchandise", "item", "inventory", "stock", "sell"]
        },
        RatePlans: {
          description: "Pricing and rate plans",
          queryKeywords: ["rate", "plan", "pricing", "cost", "tuition"]
        },
        Recitals: {
          description: "Recital events and planning",
          queryKeywords: ["recital", "performance", "show", "event", "concert"]
        },
        Seasons: {
          description: "Studio seasons configuration",
          queryKeywords: ["season", "term", "semester", "session", "year"]
        },
        Students: {
          description: "All students enrolled in the studio",
          queryKeywords: ["student", "students", "enrolled", "attendance", "registration", "child", "kid"],
          fields: {
            FirstName: "string - Student's first name",
            LastName: "string - Student's last name",
            DateOfBirth: "timestamp - Student's birth date",
            Email: "string - Student's email address",
            Active: "boolean - Whether student is currently active",
            CreatedAt: "timestamp - When student was added",
            FamilyId: "string - Associated family ID",
            Gender: "string - Student's gender",
            MedicalInfo: "string - Medical information"
          },
          commonFilters: {
            "Active": [true, false],
            "Gender": ["Male", "Female", "Other"]
          },
          queryPatterns: {
            "active_students": {
              filters: [{"field": "Active", "operator": "==", "value": true}],
              description: "Currently active students"
            },
            "students_by_age": {
              description: "Students within specific age range"
            }
          }
        },
        StudioRooms: {
          description: "Physical rooms in the studio",
          queryKeywords: ["room", "space", "studio", "capacity", "location"],
          fields: {
            Name: "string - Room name",
            Capacity: "number - Room capacity"
          }
        },
        StudioSetup: {
          description: "Studio configuration settings",
          queryKeywords: ["setup", "configuration", "settings", "progress"]
        },
        Surcharge: {
          description: "Additional fee configurations",
          queryKeywords: ["surcharge", "additional", "extra", "fee"]
        },
        Tags: {
          description: "Organizational tags",
          queryKeywords: ["tag", "label", "category", "organize"]
        },
        Users: {
          description: "Studio staff and admin users",
          queryKeywords: ["user", "staff", "admin", "employee", "access", "login"],
          fields: {
            FirstName: "string - User's first name",
            LastName: "string - User's last name",
            Email: "string - User's email",
            Role: "string - User's role in the system",
            Active: "boolean - Whether user is active"
          },
          commonFilters: {
            "Active": [true, false],
            "Role": ["Admin", "Staff", "Instructor"]
          }
        },
        SyncSense: {
          description: "AI assistant conversation history",
          queryKeywords: ["conversation", "chat", "history", "ai", "syncsense"],
          fields: {
            text: "string - Message content",
            type: "string - Message type (user/assistant)",
            timestamp: "timestamp - When message was sent",
            userId: "string - Associated user ID",
            date: "string - Date of conversation"
          }
        }
      }
    }
  },
  
  // Enhanced field relationships for better cross-collection queries
  fieldRelationships: {
    "FamilyId": {
      connectsTo: ["Families", "Students", "Charges", "Payments"],
      description: "Links families to their students, charges, and payments"
    },
    "InstructorId": {
      connectsTo: ["Instructors", "Classes"],
      description: "Links instructors to their classes"
    },
    "StudentId": {
      connectsTo: ["Students", "Classes.Students"],
      description: "Links students to their enrolled classes"
    },
    "ClassId": {
      connectsTo: ["Classes", "Recitals.Classes"],
      description: "Links classes to recitals and other references"
    },
    "SeasonId": {
      connectsTo: ["Seasons", "Classes"],
      description: "Links classes to their seasons"
    },
    "RoomId": {
      connectsTo: ["StudioRooms", "Classes"],
      description: "Links classes to their assigned rooms"
    }
  },

  // Smart query templates for complex operations
  smartQueryTemplates: {
    "financial_summary": {
      description: "Get comprehensive financial data",
      collections: ["Charges", "Payments", "Families"],
      logic: "Combine unpaid charges, recent payments, and family balances"
    },
    "class_enrollment_analysis": {
      description: "Analyze class capacity and enrollment",
      collections: ["Classes", "Students"],
      logic: "Compare current enrollment vs capacity across all classes"
    },
    "student_family_overview": {
      description: "Get student and family information together",
      collections: ["Students", "Families"],
      logic: "Link students to their family information"
    },
    "instructor_schedule": {
      description: "Show instructor teaching schedules",
      collections: ["Instructors", "Classes"],
      logic: "Link instructors to their assigned classes with schedule details"
    }
  },

  relationships: {
    "Students -> Families": "Many students can belong to one family (FamilyId)",
    "Classes -> Students": "Many-to-many relationship through Students array",
    "Classes -> Instructors": "One instructor can teach many classes (InstructorId)",
    "Classes -> ClassStyles": "Classes are associated with a style definition",
    "Classes -> StudioRooms": "One room can host many classes (RoomId)",
    "Classes -> Seasons": "Classes belong to specific seasons (SeasonId)",
    "Classes -> RatePlans": "Classes use specific rate plans (RatePlanId)",
    "Charges -> Families": "Many charges can be associated with one family (FamilyId)",
    "Payments -> Charges": "One charge can have multiple payments",
    "Families -> PaymentMethods": "Families can have multiple payment methods",
    "Communication -> Users": "Messages are associated with specific users (SenderId)",
    "Families -> Students": "Families can have multiple students (Students array)",
    "Recitals -> Classes": "Recitals can include multiple classes (Classes array)",
    "Products -> Orders": "Products can be included in multiple orders",
    "Users -> LoginHistory": "Users have a history of login sessions",
    "Seasons -> Classes": "Classes are associated with specific seasons",
    "Families -> EmergencyContacts": "Families have emergency contacts"
  },

  // Enhanced common queries with more comprehensive coverage
  commonQueries: {
    "Total Students": "Count of documents in Students collection",
    "Active Students": "Count where Active = true in Students",
    "Class Capacity": "Compare Classes.Students.length with Classes.MaxSize",
    "Unpaid Charges": "Get charges where Status != 'Paid'",
    "Students Per Class": "Length of Students array in Classes documents",
    "Classes Per Instructor": "Count of Classes documents with matching InstructorId",
    "Monthly Revenue": "Sum of AmountPaid in Charges for specific month/year",
    "Room Utilization": "Compare class schedules with StudioRooms capacity",
    "Family Balance": "Current Balance in Families collection",
    "Auto-Pay Enrollment": "Count of Families where IsOnAutoPay is true",
    "Age-Appropriate Classes": "Filter Classes where student age is between MinAge and MaxAge",
    "Payment Success Rate": "Compare Payments where Status='Paid' vs total Payments",
    "Active Products": "Count of Products where Active = true",
    "Current Season": "Get Season where IsActive = true",
    "User Login History": "Get loginHistory for specific user",
    "Product Inventory": "Sum of Sizes.Quantity for each Product",
    "AutoPay Families": "Get families where IsOnAutoPay = true",
    "Active Classes": "Get classes in current season",
    "Emergency Contacts": "Get emergency contacts for a family",
    "Payment History": "Get all payments for a family",
    "Failed Payments": "Get Payments where Status = 'Failed'",
    "Outstanding Balances": "Get Families where Balance > 0",
    "Instructor Workload": "Count classes per instructor",
    "Popular Class Styles": "Count classes by ClassStyleId",
    "Recent Registrations": "Get Students ordered by CreatedAt desc",
    "Full Classes": "Get Classes where Students.length >= MaxSize",
    "Available Spots": "Get Classes where Students.length < MaxSize",
    "Seasonal Revenue": "Sum payments by season/date range",
    "Family Communication": "Get Communication where Members contains FamilyId"
  },

  // Keywords for better query classification
  queryClassificationKeywords: {
    databaseQueries: [
      "how many", "count", "total", "sum", "list", "show me", "find", "get", "which", "what",
      "revenue", "money", "paid", "owe", "balance", "charge", "payment", "cost", "price",
      "student", "family", "class", "instructor", "teacher", "enrollment", "capacity",
      "schedule", "time", "day", "week", "month", "year", "season", "active", "inactive"
    ],
    casualQueries: [
      "hello", "hi", "help", "what is", "explain", "how to", "can you", "should i",
      "recommend", "suggest", "advice", "opinion", "think", "feel", "like", "love"
    ]
  },

  notes: [
    "All field names use PascalCase convention (e.g., FirstName, LastName)",
    "Timestamps are stored in Firebase Timestamp format",
    "IDs are auto-generated by Firestore",
    "Arrays typically contain references to other documents",
    "Payment processing is integrated with PayArc",
    "Communication system supports both direct messages and group conversations",
    "Class scheduling includes age restrictions and capacity management",
    "Financial records track both charges and payments with line items",
    "Login history tracks browser information and timestamps",
    "Products can have multiple sizes with separate inventory tracking",
    "Recitals include performance scheduling with configurable gaps",
    "Rate plans support hourly-based pricing with family discounts",
    "Payment processing includes multiple configuration levels",
    "Function logs track automated system operations",
    "Emergency contacts are stored with family records",
    "Card details are stored with limited information for security",
    "Query keywords help classify user intent and determine database access needs",
    "Smart query templates enable complex multi-collection operations",
    "Field relationships allow for intelligent cross-collection queries"
  ]
};

module.exports = DATABASE_MAP; 