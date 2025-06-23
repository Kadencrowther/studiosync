# StudioSync Charges & Payments System - Technical Documentation

## 🏗️ **System Architecture Overview**

### **Core Components**
1. **Charge Calculator** - Calculates family charges based on students, classes, rate plans
2. **Payment Processor** - Handles payment transactions via PayArc gateway  
3. **Auto-Pay System** - Automated recurring payment processing
4. **Charge Poster** - Posts calculated charges to family ledgers

### **Data Flow**
```
Family Data → Charge Calculator → Charges → Payment Processor → PayArc → Success/Failure
     ↓              ↓                ↓            ↓
 Students →     Rate Plans →     Auto-Pay →   Ledger Update
  Classes       Discounts         Monitor
   Fees
```

## 💰 **Charge Calculation System (`chargesCalculator.js`)**

### **Input Structure**
```javascript
{
  familyData: {
    id: "family123",
    FirstName: "John",
    LastName: "Smith", 
    RatePlan: "Monthly",
    PromoCodes: ["DISCOUNT20"]
  },
  studioId: "studio456"
}
```

### **Calculation Process**

#### **1. Data Fetching**
- **Studio Settings**: Default rate plans, StudentFamilyMax limits
- **Family Data**: Family details, promo codes
- **Students**: All students in family with their classes
- **Classes**: Class details, durations, rate plan assignments
- **Rate Plans**: Pricing tiers and hour-based rates
- **Discounts**: Active discounts (family, student, class, season, promo codes)
- **Fees**: Active fees from family subcollection

#### **2. Rate Plan Calculation**
```javascript
// Rate plans can have either HourRates or Tiers
{
  HourRates: [
    { Hours: 1, Rate: 75 },
    { Hours: 2, Rate: 140 },
    { Hours: 3, Rate: 195 }
  ]
}
// OR
{
  Tiers: [
    { Hours: 1, Cost: 75 },
    { Hours: 2, Cost: 140 }
  ]
}
```

**Logic**: 
- Group classes by rate plan
- Sum hours per rate plan
- Find applicable tier/rate based on total hours
- Apply StudentFamilyMax limits if configured

#### **3. Fee Processing**
Fees come from family subcollection with schedules:
```javascript
{
  Name: "Registration Fee",
  IsRecurring: false,
  Schedule: [
    {
      Status: "Unpaid",
      Amount: 50,
      DueDate: "2024-01-15",
      Month: "January 2024"
    }
  ]
}
```

**Logic**:
- For recurring fees: Find next unpaid payment due >= current date
- For one-time fees: Include if unpaid and due date <= current date

#### **4. Discount Application**

**Discount Types**:
- **Student-specific**: `AssociationType: "Student"`
- **Family-specific**: `AssociationType: "Family"`  
- **Class-specific**: `AssociationType: "Class"`
- **Season-specific**: `AssociationType: "Season"`
- **Promo codes**: `AssociationType: "Code"`
- **Multi-student**: Built into rate plans

**Application Order**:
1. Student/class/season discounts (applied to individual student totals)
2. Family-specific discounts (applied to family total)
3. Multi-student discounts (from rate plans)
4. Promo code discounts (family-level)

### **Output Structure**
```javascript
{
  success: true,
  chargeData: {
    students: [
      {
        id: "student123",
        name: "Jane Smith",
        tuition: 195.00,
        registrationFees: 50.00,
        discounts: [...],
        discountTotal: 25.00,
        total: 220.00,
        classes: [...]
      }
    ],
    totalTuition: 195.00,
    totalFees: 50.00,
    fees: [...],
    discounts: [...],
    totalDiscount: 25.00,
    finalTotal: 220.00,
    ratePlan: "Monthly"
  }
}
```

## 💳 **Payment Processing System (`processPayments.js`)**

### **PayArc Integration**

#### **API Endpoints**
- **Sandbox**: `https://testapi.payarc.net/v1/`
- **Production**: `https://api.payarc.net/v1/`

#### **Authentication**
- API Key in header: `Authorization: Bearer {apiKey}`
- Merchant Code in requests

#### **Core Operations**

1. **Card Tokenization**
```javascript
POST /tokens
{
  card_number: "4111111111111111",
  exp_month: "12", 
  exp_year: "2025",
  cvc: "123"
}
```

2. **Customer Creation**  
```javascript
POST /customers
{
  name: "John Smith",
  email: "john@example.com",
  phone: "555-1234"
}
```

3. **Payment Method Attachment**
```javascript
POST /customers/{customerId}/payment_methods  
{
  token_id: "token_123"
}
```

4. **Charge Processing**
```javascript
POST /charges
{
  amount: 22000, // $220.00 in cents
  currency: "usd",
  customer_id: "customer_123",
  description: "Monthly Tuition",
  source: "paymentmethod_456"
}
```

### **Payment Flows**

#### **1. Registration Payment** (`processRegistrationPayment`)
- New customer registration with payment
- Creates customer, tokenizes card, processes payment
- Stores customer info and payment method

#### **2. One-Time Payment** (`processOneTimePayment`)  
- Guest checkout or existing customer
- Optional customer creation
- Single payment processing

#### **3. Existing Customer Payment** (`processExistingCustomerPayment`)
- Uses stored payment methods
- Customer already exists in PayArc
- Quick payment processing

### **Error Handling**
- Structured error responses with codes
- Sensitive data masking in logs
- Retry logic for network failures
- Fallback payment method handling

## 🔄 **Auto-Pay System (`AutoPay.js`)**

### **Scheduling Logic**
- Runs on configurable schedule (daily/weekly)
- Processes families with auto-pay enabled
- Handles retry logic for failed payments

### **Process Flow**
1. **Find Eligible Families**
   - Auto-pay enabled
   - Has stored payment method
   - Has unpaid charges

2. **Calculate Current Charges**
   - Uses charge calculator
   - Gets latest family charges

3. **Process Payment**
   - Attempts payment with stored method
   - Handles payment failures
   - Updates payment status

4. **Retry Management**
   - Configurable retry attempts
   - Exponential backoff
   - Email notifications

### **Monitoring & Logging**
- Comprehensive logging for all operations
- Success/failure tracking
- Performance metrics
- Alert system for failures

## 📊 **Charge Posting System (`PostCharges.js`)**

### **Ledger Integration**
- Posts calculated charges to family ledgers
- Creates charge documents with line items
- Tracks payment status and history

### **Monthly Processing**
- Automated monthly charge posting
- Handles recurring fees and tuition
- Updates charge statuses

## 🔧 **Configuration & Settings**

### **Studio Settings**
```javascript
{
  DefaultRatePlan: "Monthly",
  StudentFamilyMax: {
    StudentMax: 200.00,
    FamilyMax: 500.00
  },
  PaymentSettings: {
    ApiKey: "encrypted_key",
    MerchantCode: "STUDIO123",
    TestMode: false
  }
}
```

### **Rate Plan Structure**
```javascript
{
  Name: "Monthly",
  HourRates: [
    { Hours: 1, Rate: 75 },
    { Hours: 2, Rate: 140 },
    { Hours: 3, Rate: 195 },
    { Hours: 4, Rate: 240 },
    { Hours: 5, Rate: 275 }
  ],
  FamilyDiscount: {
    StudentThreshold: 2,
    Amount: 10,
    Type: "percentage"
  }
}
```

## 🚨 **Known Issues & Limitations**

### **Current Issues**
1. **Code Duplication**: Similar logic repeated across files
2. **Error Handling**: Inconsistent error responses
3. **Testing**: Limited test coverage
4. **Performance**: Multiple Firestore reads per calculation
5. **File Size**: Files are too large (1000+ lines)

### **Technical Debt**
- Multiple backup files in repository
- Inconsistent logging formats
- Mixed async/await and Promise patterns
- Hard-coded configuration values

## 🔍 **Debugging Guide**

### **Common Issues**

1. **Charge Calculation Errors**
   - Check rate plan configuration
   - Verify class duration and rate plan assignments
   - Review discount associations and active status

2. **Payment Failures**
   - Verify PayArc credentials
   - Check payment method validity
   - Review transaction limits

3. **Auto-Pay Issues**
   - Confirm auto-pay enabled for family
   - Check stored payment method status
   - Review retry attempt history

### **Logging Locations**
- Firebase Functions Console
- PayArc transaction dashboard
- Studio-specific logs in Firestore

## 📈 **Performance Considerations**

### **Current Bottlenecks**
- Multiple sequential Firestore reads
- Large response payloads
- Synchronous processing

### **Optimization Opportunities**
- Batch Firestore operations
- Cache studio settings and rate plans
- Implement async processing for auto-pay
- Add request/response compression

---

**Next Steps**: See `CHARGES_AND_PAYMENTS_MODULARIZATION_PLAN.md` for improvement roadmap. 