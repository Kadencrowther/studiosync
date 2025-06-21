const functions = require('firebase-functions');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Calculates charges for a family
 * This function can be called by other functions like PostCharges.js
 */
exports.calculateFamilyCharges = async (familyData, studioId) => {
  try {
    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    
    // Get all students in this family
    const studentsSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('Students')
      .where('FamilyId', '==', familyData.id)
      .where('IsActive', '==', true)
      .get();
    
    const students = studentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Skip if no active students
    if (students.length === 0) {
      return {
        success: false,
        message: 'No active students found for this family',
        amount: 0
      };
    }
    
    // Get all classes for these students
    const studentIds = students.map(s => s.id);
    const classRegistrationsSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('ClassRegistrations')
      .where('StudentId', 'in', studentIds)
      .where('IsActive', '==', true)
      .get();
    
    // Group class registrations by student
    const studentClasses = {};
    classRegistrationsSnapshot.docs.forEach(doc => {
      const registration = doc.data();
      if (!studentClasses[registration.StudentId]) {
        studentClasses[registration.StudentId] = [];
      }
      studentClasses[registration.StudentId].push({
        id: doc.id,
        ...registration
      });
    });
    
    // Get all rate plans
    const ratePlansSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('RatePlans')
      .where('IsActive', '==', true)
      .get();
    
    const ratePlans = {};
    ratePlansSnapshot.docs.forEach(doc => {
      ratePlans[doc.id] = { id: doc.id, ...doc.data() };
    });
    
    // Get all discounts
    const discountsSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('Discounts')
      .where('IsActive', '==', true)
      .get();
    
    const discounts = discountsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate charges for each student
    const studentCharges = [];
    let familyTotal = 0;
    const lineItems = [];
    
    for (const student of students) {
      const classes = studentClasses[student.id] || [];
      
      // Skip students with no classes
      if (classes.length === 0) continue;
      
      // Calculate tuition based on rate plans
      const hoursByRatePlan = {};
      classes.forEach(classInfo => {
        const hours = (classInfo.Duration || 60) / 60; // Convert minutes to hours
        const ratePlanId = classInfo.RatePlanId;
        
        if (!hoursByRatePlan[ratePlanId]) {
          hoursByRatePlan[ratePlanId] = 0;
        }
        
        hoursByRatePlan[ratePlanId] += hours;
      });
      
      // Calculate cost for each rate plan
      let tuitionFromRatePlans = 0;
      const ratePlanBreakdown = [];
      
      Object.entries(hoursByRatePlan).forEach(([ratePlanId, totalHours]) => {
        const ratePlan = ratePlans[ratePlanId];
        if (ratePlan && ratePlan.HourRates) {
          // Sort rates by hours in ascending order
          const sortedRates = [...ratePlan.HourRates].sort((a, b) => a.Hours - b.Hours);
          
          // Find the appropriate rate for the total hours
          let selectedRate = sortedRates[0];
          for (let i = 0; i < sortedRates.length; i++) {
            if (totalHours >= sortedRates[i].Hours) {
              selectedRate = sortedRates[i];
            } else {
              break;
            }
          }
          
          const cost = selectedRate.Rate;
          tuitionFromRatePlans += cost;
          
          ratePlanBreakdown.push({
            ratePlanId,
            ratePlanName: ratePlan.Name,
            hours: totalHours,
            rate: selectedRate.Rate,
            cost
          });
          
          // Add to line items
          lineItems.push({
            Amount: cost,
            Description: `${ratePlan.Name} for ${student.FirstName} ${student.LastName}`,
            StudentId: student.id,
            StudentName: `${student.FirstName} ${student.LastName}`,
            Type: "Tuition",
            RatePlanId: ratePlanId,
            RatePlanName: ratePlan.Name,
            Hours: totalHours
          });
        }
      });
      
      // Calculate class fees
      let classFees = 0;
      const feeBreakdown = [];
      
      classes.forEach(classInfo => {
        if (classInfo.FeeAmount && classInfo.FeeType) {
          let feeAmount = parseFloat(classInfo.FeeAmount);
          
          switch (classInfo.FeeType) {
            case 'OneTime':
              // Only charge one-time fees if they haven't been charged before
              // You'd need to check previous charges here
              classFees += feeAmount;
              feeBreakdown.push({
                classId: classInfo.ClassId,
                className: classInfo.ClassName,
                feeType: 'OneTime',
                amount: feeAmount
              });
              
              // Add to line items
              lineItems.push({
                Amount: feeAmount,
                Description: `One-time fee for ${classInfo.ClassName}`,
                StudentId: student.id,
                StudentName: `${student.FirstName} ${student.LastName}`,
                Type: "Fee",
                FeeType: "OneTime",
                ClassId: classInfo.ClassId,
                ClassName: classInfo.ClassName
              });
              break;
              
            case 'Recurring':
              classFees += feeAmount;
              feeBreakdown.push({
                classId: classInfo.ClassId,
                className: classInfo.ClassName,
                feeType: 'Recurring',
                amount: feeAmount
              });
              
              // Add to line items
              lineItems.push({
                Amount: feeAmount,
                Description: `Monthly fee for ${classInfo.ClassName}`,
                StudentId: student.id,
                StudentName: `${student.FirstName} ${student.LastName}`,
                Type: "Fee",
                FeeType: "Recurring",
                ClassId: classInfo.ClassId,
                ClassName: classInfo.ClassName
              });
              break;
              
            case 'BrokenUp':
              if (classInfo.BreakUpDuration) {
                const brokenUpAmount = feeAmount / classInfo.BreakUpDuration;
                classFees += brokenUpAmount;
                feeBreakdown.push({
                  classId: classInfo.ClassId,
                  className: classInfo.ClassName,
                  feeType: 'BrokenUp',
                  originalAmount: feeAmount,
                  installment: brokenUpAmount,
                  duration: classInfo.BreakUpDuration
                });
                
                // Add to line items
                lineItems.push({
                  Amount: brokenUpAmount,
                  Description: `Installment fee for ${classInfo.ClassName} (${feeBreakdown.length}/${classInfo.BreakUpDuration})`,
                  StudentId: student.id,
                  StudentName: `${student.FirstName} ${student.LastName}`,
                  Type: "Fee",
                  FeeType: "BrokenUp",
                  ClassId: classInfo.ClassId,
                  ClassName: classInfo.ClassName,
                  OriginalAmount: feeAmount,
                  InstallmentNumber: feeBreakdown.length,
                  TotalInstallments: classInfo.BreakUpDuration
                });
              }
              break;
          }
        }
      });
      
      // Calculate total before discounts
      const totalBeforeDiscounts = tuitionFromRatePlans + classFees;
      
      // Apply discounts
      let totalDiscount = 0;
      const appliedDiscounts = [];
      
      // Apply student-specific discounts
      discounts.forEach(discount => {
        if (discount.AssociationType === 'Student' && discount.AssociationItemId === student.id) {
          let discountAmount = 0;
          
          if (discount.DiscountType === 'Percentage') {
            discountAmount = totalBeforeDiscounts * (discount.Amount / 100);
          } else {
            discountAmount = parseFloat(discount.Amount);
          }
          
          totalDiscount += discountAmount;
          appliedDiscounts.push({
            id: discount.id,
            name: discount.Name,
            type: discount.DiscountType,
            amount: discountAmount
          });
          
          // Add to line items (as negative amount)
          lineItems.push({
            Amount: -discountAmount,
            Description: `${discount.Name} for ${student.FirstName} ${student.LastName}`,
            StudentId: student.id,
            StudentName: `${student.FirstName} ${student.LastName}`,
            Type: "Discount",
            DiscountId: discount.id,
            DiscountName: discount.Name,
            DiscountType: discount.DiscountType
          });
        }
      });
      
      // Calculate final amount for this student
      const studentTotal = totalBeforeDiscounts - totalDiscount;
      familyTotal += studentTotal;
      
      studentCharges.push({
        studentId: student.id,
        studentName: `${student.FirstName} ${student.LastName}`,
        ratePlanBreakdown,
        feeBreakdown,
        tuition: tuitionFromRatePlans,
        fees: classFees,
        totalBeforeDiscounts,
        discounts: appliedDiscounts,
        totalDiscount,
        total: studentTotal
      });
    }
    
    // Apply family-level discounts
    let familyDiscount = 0;
    const familyDiscounts = [];
    
    // Apply family max if configured
    const studentFamilyMaxSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('StudentFamilyMax')
      .where('IsActive', '==', true)
      .limit(1)
      .get();
    
    if (!studentFamilyMaxSnapshot.empty) {
      const familyMax = studentFamilyMaxSnapshot.docs[0].data();
      const maxAmount = parseFloat(familyMax.Amount);
      
      if (familyTotal > maxAmount) {
        const familyMaxDiscount = familyTotal - maxAmount;
        familyDiscount += familyMaxDiscount;
        familyDiscounts.push({
          name: 'Family Maximum',
          amount: familyMaxDiscount
        });
        
        // Add to line items (as negative amount)
        lineItems.push({
          Amount: -familyMaxDiscount,
          Description: `Family Maximum Discount`,
          StudentId: null,
          Type: "FamilyDiscount",
          DiscountName: "Family Maximum"
        });
        
        familyTotal = maxAmount;
      }
    }
    
    // Apply family-specific discounts
    discounts.forEach(discount => {
      if (discount.AssociationType === 'Family' && discount.AssociationItemId === familyData.id) {
        let discountAmount = 0;
        
        if (discount.DiscountType === 'Percentage') {
          discountAmount = familyTotal * (discount.Amount / 100);
        } else {
          discountAmount = parseFloat(discount.Amount);
        }
        
        familyDiscount += discountAmount;
        familyDiscounts.push({
          id: discount.id,
          name: discount.Name,
          type: discount.DiscountType,
          amount: discountAmount
        });
        
        // Add to line items (as negative amount)
        lineItems.push({
          Amount: -discountAmount,
          Description: `${discount.Name} (Family Discount)`,
          StudentId: null,
          Type: "FamilyDiscount",
          DiscountId: discount.id,
          DiscountName: discount.Name,
          DiscountType: discount.DiscountType
        });
        
        familyTotal -= discountAmount;
      }
    });
    
    // Calculate processing fee if applicable
    let processingFee = 0;
    const surchargeDoc = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('Surcharge')
      .doc('SurchargeSettings')
      .get();
    
    if (surchargeDoc.exists) {
      const surcharge = surchargeDoc.data();
      
      if (surcharge.IsActive) {
        if (surcharge.Type === 'Percentage') {
          processingFee = familyTotal * (surcharge.Amount / 100);
        } else if (surcharge.Type === 'Fixed') {
          processingFee = parseFloat(surcharge.Amount);
        }
        
        // Apply min/max if configured
        if (surcharge.Minimum && processingFee < surcharge.Minimum) {
          processingFee = surcharge.Minimum;
        } else if (surcharge.Maximum && processingFee > surcharge.Maximum) {
          processingFee = surcharge.Maximum;
        }
        
        // Add to line items
        if (processingFee > 0) {
          lineItems.push({
            Amount: processingFee,
            Description: surcharge.Name || "Processing Fee",
            StudentId: null,
            Type: "ProcessingFee"
          });
        }
      }
    }
    
    // Final total with processing fee
    const finalTotal = familyTotal + processingFee;
    
    // Create charge record
    const chargeData = {
      FamilyId: familyData.id,
      FamilyName: familyData.LastName ? `${familyData.FirstName} ${familyData.LastName}` : familyData.FamilyName,
      Month: currentMonth,
      Year: currentYear,
      ChargeDate: admin.firestore.Timestamp.now(),
      StudentCharges: studentCharges,
      FamilyDiscounts: familyDiscounts,
      FamilyDiscountTotal: familyDiscount,
      ProcessingFee: processingFee,
      Subtotal: familyTotal,
      Total: finalTotal,
      Status: 'Pending',
      DueDate: new Date(now.getFullYear(), now.getMonth(), 15), // Due on the 15th
      LineItems: lineItems,
      Description: `Monthly Charges for ${currentMonth}/${currentYear}`,
      Type: "MonthlyCharge"
    };
    
    return {
      success: true,
      chargeData
    };
    
  } catch (error) {
    console.error('Error calculating family charges:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Calculates charges for all active students
 * Can be called by other functions or directly as an HTTP function
 */
exports.calculateCharges = onCall({
  region: "us-central1",
  memory: "512MiB"
}, async (data) => {
  try {
    // Get studio ID from request or use default
    const studioId = data?.studioId || 'defaultStudioId';
    
    // Get all active families
    const familiesSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('Families')
      .where('IsActive', '==', true)
      .get();
    
    const chargeResults = [];
    
    // Process each family
    for (const familyDoc of familiesSnapshot.docs) {
      const family = { id: familyDoc.id, ...familyDoc.data() };
      
      // Calculate charges for this family
      const result = await exports.calculateFamilyCharges(family, studioId);
      
      if (result.success) {
        // Save charge to database
        const chargeRef = await admin.firestore()
          .collection('Studios')
          .doc(studioId)
          .collection('Charges')
          .add(result.chargeData);
        
        chargeResults.push({
          familyId: family.id,
          familyName: result.chargeData.FamilyName,
          chargeId: chargeRef.id,
          amount: result.chargeData.Total
        });
      } else {
        console.log(`Skipping family ${family.id}: ${result.message || result.error}`);
      }
    }
    
    return {
      success: true,
      message: `Successfully calculated charges for ${chargeResults.length} families`,
      charges: chargeResults
    };
    
  } catch (error) {
    console.error('Error calculating charges:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// This function can be scheduled to run monthly
exports.scheduleMonthlyCharges = onSchedule({
  schedule: "0 5 1 * *", // Run at 5:00 AM on the 1st of every month
  timeZone: "America/New_York",
  retryCount: 3,
  region: "us-central1",
  memory: "512MiB"
}, async (event) => {
  try {
    // Get all studios
    const studiosSnapshot = await admin.firestore()
      .collection('Studios')
      .get();
    
    for (const studioDoc of studiosSnapshot.docs) {
      const studioId = studioDoc.id;
      
      // Calculate charges for this studio
      await exports.calculateCharges({
        data: { studioId }
      });
    }
    
    return null;
  } catch (error) {
    console.error('Error in scheduled charges:', error);
    return null;
  }
});

// Function to generate a summary of charges
exports.getChargesSummary = onCall({
  region: "us-central1",
  memory: "512MiB"
}, async (data) => {
  try {
    const studioId = data?.studioId || 'defaultStudioId';
    const month = data?.month || (new Date().getMonth() + 1);
    const year = data?.year || new Date().getFullYear();
    
    // Get all charges for the specified month/year
    const chargesSnapshot = await admin.firestore()
      .collection('Studios')
      .doc(studioId)
      .collection('Charges')
      .where('Month', '==', month)
      .where('Year', '==', year)
      .get();
    
    const charges = chargesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate summary statistics
    let totalCharged = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let familiesWithCharges = 0;
    let familiesPaid = 0;
    let familiesOutstanding = 0;
    
    charges.forEach(charge => {
      totalCharged += charge.Total;
      familiesWithCharges++;
      
      // Check if charge has payments
      if (charge.Status === 'Paid') {
        totalPaid += charge.Total;
        familiesPaid++;
      } else {
        totalOutstanding += charge.Total;
        familiesOutstanding++;
      }
    });
    
    return {
      success: true,
      summary: {
        month,
        year,
        totalCharged,
        totalPaid,
        totalOutstanding,
        familiesWithCharges,
        familiesPaid,
        familiesOutstanding,
        charges
      }
    };
    
  } catch (error) {
    console.error('Error generating charges summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Create an Express app for the API
const apiApp = express();

// Enable CORS
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// Add a middleware to log all requests
apiApp.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'unknown'}`);
  next();
});

// Test endpoint
apiApp.get("/", (req, res) => {
  res.status(200).json({ message: "Charges API is working!", timestamp: new Date().toISOString() });
});

// Main endpoint to calculate family charges
apiApp.post("/calculateFamilyCharges", async (req, res) => {
  try {
    // Get the request body
    const { familyData, studioId } = req.body;
    
    if (!familyData || !studioId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: familyData and studioId'
      });
    }
    
    console.log(`Calculating charges for family: ${familyData.id || familyData.FamilyId} in studio: ${studioId}`);
    
    // Call the existing function
    const result = await exports.calculateFamilyCharges(familyData, studioId);
    
    // Return the result
    return res.json(result);
  } catch (error) {
    console.error('Error in calculateFamilyCharges API:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    });
  }
});

// Export the Express app as a Firebase Function v2
exports.calculateChargesApi = onRequest({
  region: "us-central1",
  memory: "512MiB",
  minInstances: 0,
  maxInstances: 10,
  timeoutSeconds: 60,
  invoker: "public" // Allow unauthenticated access
}, apiApp);

// Make sure you're exporting correctly
module.exports = {
  calculateFamilyCharges: exports.calculateFamilyCharges,
  calculateChargesApi: exports.calculateChargesApi
}; 