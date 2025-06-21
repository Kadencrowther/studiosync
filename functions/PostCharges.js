const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { calculateFamilyCharges } = require("./calculateCharges");
const axios = require('axios');
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create Express app for HTTP endpoint
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    "https://studiosync-af73d.web.app",
    "https://studiosync-af73d.firebaseapp.com", 
    "https://studiosyncdance.com",
    "http://localhost:5000"
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// HTTP endpoint to trigger charges for a specific studio
app.options("*", (req, res) => {
  // Set CORS headers for preflight requests
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).send();
});

app.post("/", async (req, res) => {
  // Set CORS headers explicitly
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    const { studioId } = req.body;
    
    if (!studioId) {
      return res.status(400).json({ error: "studioId is required" });
    }
    
    // Get studio data
    const studioDoc = await admin.firestore().collection("Studios").doc(studioId).get();
    
    if (!studioDoc.exists) {
      return res.status(404).json({ error: "Studio not found" });
    }
    
    const studioData = studioDoc.data();
    
    // Process charges for this studio
    let totalFamiliesProcessed = 0;
    
    // Get all families for this studio
    const familiesSnapshot = await studioDoc.ref.collection("Families").get();
    
    console.log(`Found ${familiesSnapshot.docs.length} families for studio ${studioId}`);
    
    // Process each family
    for (const familyDoc of familiesSnapshot.docs) {
      const familyId = familyDoc.id;
      const familyData = familyDoc.data();
      
      try {
        console.log(`Processing charges for family: ${familyId}`);
        
        // Check if charges already exist for this month/year
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1; // 1-12
        const currentYear = currentDate.getFullYear();
        
        console.log(`Checking for existing charges for family ${familyId}, month: ${currentMonth}, year: ${currentYear}`);
        
        try {
          // Get charges from the family's charges subcollection instead
          console.log(`Getting charges from family subcollection: Studios/${studioId}/Families/${familyId}/Charges`);
          const chargesRef = admin.firestore().collection(`Studios/${studioId}/Families/${familyId}/Charges`);
          const snapshot = await chargesRef.get();
          console.log(`Found ${snapshot.size} charges for family ${familyId}`);
          
          // Filter the results in memory
          let hasMonthlyChargeForCurrentMonth = false;
          let familyChargesCount = snapshot.size;
          let monthlyChargesCount = 0;
          let currentMonthChargesCount = 0;
          
          snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Found charge for family ${familyId}: Type=${data.Type}, ChargeDate=${data.ChargeDate}`);
            
            // Check if this is a monthly charge
            if (data.Type !== 'MonthlyCharge') {
              console.log(`Charge is not a MonthlyCharge, it's a ${data.Type} charge`);
              return; // Skip if not a monthly charge
            }
            
            monthlyChargesCount++;
            
            // If Month and Year fields exist, use them
            if (data.Month === currentMonth && data.Year === currentYear) {
              console.log(`Found matching MonthlyCharge with Month=${data.Month}, Year=${data.Year}`);
              hasMonthlyChargeForCurrentMonth = true;
              currentMonthChargesCount++;
              return;
            }
            
            // If no Month/Year fields, try to extract from ChargeDate
            if (data.ChargeDate) {
              try {
                const chargeDate = new Date(data.ChargeDate);
                const chargeMonth = chargeDate.getMonth() + 1;
                const chargeYear = chargeDate.getFullYear();
                
                console.log(`Extracted date from ChargeDate: month=${chargeMonth}, year=${chargeYear}`);
                
                if (chargeMonth === currentMonth && chargeYear === currentYear) {
                  console.log(`Found matching MonthlyCharge using ChargeDate`);
                  hasMonthlyChargeForCurrentMonth = true;
                  currentMonthChargesCount++;
                }
              } catch (e) {
                console.log(`Error parsing ChargeDate: ${e}`);
              }
            }
          });
          
          console.log(`Family ${familyId} charge summary: total=${familyChargesCount}, monthly=${monthlyChargesCount}, currentMonth=${currentMonthChargesCount}`);
          
          if (hasMonthlyChargeForCurrentMonth) {
            console.log(`Family ${familyId} already has charges for ${currentMonth}/${currentYear}, skipping`);
            continue;
          }
          
          // Before the API call
          console.log(`Calling charges calculator API for family ${familyId}`);
          console.log(`Family data keys: ${Object.keys(familyData).join(', ')}`);

          // Add the family ID to the familyData object
          familyData.id = familyId;

          try {
            // Call the chargesCalculator API with error handling
            console.log(`Making API request to calculate charges for family ${familyId}`);
            const response = await axios.post(
              'https://us-central1-studiosync-af73d.cloudfunctions.net/chargesCalculator/calculateFamilyCharges',
              {
                familyData,
                studioId
              }
            );
            
            console.log(`Received response from charges calculator API: ${response.status}`);
            
            // Log the entire response data
            console.log(`API response data for family ${familyId}: ${JSON.stringify(response.data, null, 2)}`);
            
            const result = response.data;
            
            if (!result.success) {
              console.log(`API returned error: ${result.error || 'Unknown error'}`);
              continue;
            }
            
            // Get the charge data
            const chargeData = result.chargeData || {};

            // Check if there's an amount to charge
            if (!chargeData.finalTotal || chargeData.finalTotal <= 0) {
              console.log(`No charges to post for family: ${familyId} (amount is ${chargeData.finalTotal || 0})`);
              continue;
            }
            
            console.log(`Posting charge of ${chargeData.finalTotal} for family: ${familyId}`);
            
            // Post charge to ledger with error handling
            try {
              const postedCharge = await postChargeToLedger(studioId, familyId, chargeData);
              
              if (postedCharge) {
                // Get current family balance
                const currentBalance = familyData.Balance || 0;
                const newBalance = currentBalance + postedCharge.Amount;
                
                // Update family balance
                await familyDoc.ref.update({
                  Balance: admin.firestore.FieldValue.increment(postedCharge.Amount),
                  LastChargeDate: admin.firestore.FieldValue.serverTimestamp(),
                  LastChargeAmount: postedCharge.Amount
                });
                
                totalFamiliesProcessed++;
              }
            } catch (ledgerError) {
              console.error(`Error posting charge to ledger: ${ledgerError}`);
              throw ledgerError;
            }
          } catch (apiError) {
            console.error(`Error calling charges calculator API: ${apiError}`);
            throw apiError;
          }
          
        } catch (error) {
          console.error(`Error checking for existing charges: ${error}`);
          throw error;
        }
        
      } catch (error) {
        console.error(`❌ Error processing charges for family ${familyId}:`, error);
        
        // Log the error to Firestore for tracking
        await admin.firestore().collection(`Studios/${studioId}/ChargeErrors`).add({
          FamilyId: familyId,
          FamilyName: familyData.FamilyName || `${familyData.FirstName} ${familyData.LastName}`,
          Error: error.message,
          Timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    console.log(`Studio ${studioId} monthly charges summary: ${totalFamiliesProcessed} families processed`);
    
    return res.status(200).json({
      success: true,
      familiesProcessed: totalFamiliesProcessed
    });
    
  } catch (error) {
    console.error("❌ Error in monthly charges processing:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

async function postChargeToLedger(studioId, familyId, chargeData) {
  console.log(`Posting charge to ledger for family ${familyId}`);
  
  // Create a clean charge document
  const currentDate = new Date();
  
  // Extract data from chargeData
  const totalAmount = chargeData.finalTotal || 0;
  const students = chargeData.students || [];
  const fees = chargeData.fees || [];
  
  // Skip if amount is zero or undefined
  if (!totalAmount || totalAmount <= 0) {
    console.log(`No charge to post - amount is ${totalAmount}`);
    return null;
  }
  
  // Create line items from students and fees
  const lineItems = [];
  
  // Add tuition line items for each student
  students.forEach(student => {
    if (student.tuition > 0) {
      lineItems.push({
        Amount: student.tuition,
        Description: `Tuition Rate for ${student.name}`,
        StudentId: student.id || null,
        StudentName: student.name || "Unknown",
        Type: "TuitionRate"
      });
    }
    
    // Add registration fees if any
    if (student.registrationFees > 0) {
      lineItems.push({
        Amount: student.registrationFees,
        Description: `Registration Fee for ${student.name}`,
        StudentId: student.id || null,
        StudentName: student.name || "Unknown",
        Type: "RegistrationFee"
      });
    }
    
    // Add costume fees if any
    if (student.costumeFees > 0) {
      lineItems.push({
        Amount: student.costumeFees,
        Description: `Costume Fee for ${student.name}`,
        StudentId: student.id || null,
        StudentName: student.name || "Unknown",
        Type: "CostumeFee"
      });
    }
  });
  
  // Add fee line items
  fees.forEach(fee => {
    lineItems.push({
      Amount: fee.amount,
      Description: fee.name,
      StudentId: fee.studentId || null,
      StudentName: fee.studentName || "Unknown",
      Type: fee.type || "Fee",
      Duration: fee.duration || null,
      Frequency: fee.frequency || null,
      BrokenUpCount: fee.brokenUpCount || null
    });
  });
  
  // Get current family balance
  const familyDoc = await admin.firestore().collection(`Studios/${studioId}/Families`).doc(familyId).get();
  const currentBalance = familyDoc.data()?.Balance || 0;
  const updatedBalance = currentBalance + totalAmount;
  
  // Create the charge document
  const chargeDoc = {
    Amount: totalAmount,
    AmountPaid: 0,
    ChargeDate: currentDate.toISOString(),
    CreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    Description: `Monthly Tuition for ${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`,
    FamilyId: familyId,
    LineItems: lineItems,
    Status: 'Unpaid',
    Type: 'MonthlyCharge',
    Month: currentDate.getMonth() + 1,
    Year: currentDate.getFullYear(),
    Subtotal: totalAmount,
    ProcessingFee: 0,
    UpdatedBalance: updatedBalance
  };
  
  console.log(`Final charge document: ${JSON.stringify(chargeDoc, null, 2)}`);
  
  // Add to both collections for backward compatibility
  await admin.firestore().collection(`Studios/${studioId}/Charges`).add(chargeDoc);
  await admin.firestore().collection(`Studios/${studioId}/Families/${familyId}/Charges`).add(chargeDoc);
  
  console.log(`Successfully posted charge to ledger for family ${familyId}`);
  
  return chargeDoc;
}

/**
 * Main function to post monthly charges for all studios
 */
async function processMonthlyCharges() {
  try {
    console.log("🕒 Starting monthly charges processing...");
    
    // Get current date and log time in different timezones
    const today = new Date();
    const dayOfMonth = today.getDate();
    
    // Log times in different timezones
    const estTime = new Date(today.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const cstTime = new Date(today.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const mstTime = new Date(today.toLocaleString('en-US', { timeZone: 'America/Denver' }));
    const pstTime = new Date(today.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    
    console.log(`⏰ Current times in different timezones:
    EST: ${estTime.toLocaleString()}
    CST: ${cstTime.toLocaleString()}
    MST: ${mstTime.toLocaleString()}
    PST: ${pstTime.toLocaleString()}`);
    
    console.log(`📅 Processing monthly charges for day ${dayOfMonth} of the month`);
    
    // Get all studios
    const studiosSnapshot = await admin.firestore().collection("Studios").get();
    console.log(`Found ${studiosSnapshot.docs.length} studios to check for monthly charges`);
    
    let studiosProcessed = 0;
    let totalFamiliesProcessed = 0;
    
    // Process each studio
    for (const studioDoc of studiosSnapshot.docs) {
      const studioId = studioDoc.id;
      const studioData = studioDoc.data();
      
      // Get PaymentProcessing settings from the correct subcollection
      const settingsDoc = await admin
        .firestore()
        .collection(`Studios/${studioId}/PaymentProcessing`)
        .doc("Settings")
        .get();

      const settingsData = settingsDoc.exists ? settingsDoc.data() : null;
      const postChargesDay = settingsData?.General?.PostChargesDay;
      
      // Log the PaymentProcessing Settings structure
      console.log(`\n🔍 Checking studio ${studioId} PaymentProcessing Settings:`);
      console.log(`Settings document exists: ${settingsDoc.exists}`);
      
      if (settingsData) {
        console.log(`General settings exist: ${!!settingsData.General}`);
        if (settingsData.General) {
          console.log(`PostChargesDay value: ${settingsData.General.PostChargesDay}`);
        }
      }
      
      // Check if studio has post charges day configured
      if (postChargesDay === undefined) {
        console.log(`Studio ${studioId} does not have PostChargesDay configured, skipping`);
        continue;
      }

      // Add explicit day comparison logging
      console.log(`\n📊 Day comparison for studio ${studioId}:`);
      console.log(`Current day of month: ${dayOfMonth}`);
      console.log(`Studio's PostChargesDay: ${postChargesDay}`);
      const isTodayPostChargesDay = dayOfMonth === postChargesDay;
      console.log(`Is today the studio's PostChargesDay? ${isTodayPostChargesDay ? '✅ YES' : '❌ NO'}`);
      
      // Check if today is the post charges day for this studio
      if (!isTodayPostChargesDay) {
        console.log(`Skipping studio ${studioId} - today is not their PostChargesDay`);
        continue;
      }
      
      console.log(`🏢 Processing monthly charges for studio ${studioId} (post charges day: ${postChargesDay})`);
      
      // Get all families for this studio
      const familiesSnapshot = await studioDoc.ref.collection("Families").get();
      
      console.log(`Found ${familiesSnapshot.docs.length} families for studio ${studioId}`);
      
      let studioFamiliesProcessed = 0;
      
      // Process each family
      for (const familyDoc of familiesSnapshot.docs) {
        const familyId = familyDoc.id;
        const familyData = familyDoc.data();
        
        try {
          console.log(`Processing charges for family: ${familyId}`);
          
          // Check if charges already exist for this month/year
          const currentDate = new Date();
          const currentMonth = currentDate.getMonth() + 1; // 1-12
          const currentYear = currentDate.getFullYear();
          
          console.log(`Checking for existing charges for family ${familyId}, month: ${currentMonth}, year: ${currentYear}`);
          
          try {
            // Get charges from the family's charges subcollection instead
            console.log(`Getting charges from family subcollection: Studios/${studioId}/Families/${familyId}/Charges`);
            const chargesRef = admin.firestore().collection(`Studios/${studioId}/Families/${familyId}/Charges`);
            const snapshot = await chargesRef.get();
            console.log(`Found ${snapshot.size} charges for family ${familyId}`);
            
            // Filter the results in memory
            let hasMonthlyChargeForCurrentMonth = false;
            let familyChargesCount = snapshot.size;
            let monthlyChargesCount = 0;
            let currentMonthChargesCount = 0;
            
            snapshot.forEach(doc => {
              const data = doc.data();
              console.log(`Found charge for family ${familyId}: Type=${data.Type}, ChargeDate=${data.ChargeDate}`);
              
              // Check if this is a monthly charge
              if (data.Type !== 'MonthlyCharge') {
                console.log(`Charge is not a MonthlyCharge, it's a ${data.Type} charge`);
                return; // Skip if not a monthly charge
              }
              
              monthlyChargesCount++;
              
              // If Month and Year fields exist, use them
              if (data.Month === currentMonth && data.Year === currentYear) {
                console.log(`Found matching MonthlyCharge with Month=${data.Month}, Year=${data.Year}`);
                hasMonthlyChargeForCurrentMonth = true;
                currentMonthChargesCount++;
                return;
              }
              
              // If no Month/Year fields, try to extract from ChargeDate
              if (data.ChargeDate) {
                try {
                  const chargeDate = new Date(data.ChargeDate);
                  const chargeMonth = chargeDate.getMonth() + 1;
                  const chargeYear = chargeDate.getFullYear();
                  
                  console.log(`Extracted date from ChargeDate: month=${chargeMonth}, year=${chargeYear}`);
                  
                  if (chargeMonth === currentMonth && chargeYear === currentYear) {
                    console.log(`Found matching MonthlyCharge using ChargeDate`);
                    hasMonthlyChargeForCurrentMonth = true;
                    currentMonthChargesCount++;
                  }
                } catch (e) {
                  console.log(`Error parsing ChargeDate: ${e}`);
                }
              }
            });
            
            console.log(`Family ${familyId} charge summary: total=${familyChargesCount}, monthly=${monthlyChargesCount}, currentMonth=${currentMonthChargesCount}`);
            
            if (hasMonthlyChargeForCurrentMonth) {
              console.log(`Family ${familyId} already has charges for ${currentMonth}/${currentYear}, skipping`);
              continue;
            }
            
            // Before the API call
            console.log(`Calling charges calculator API for family ${familyId}`);
            console.log(`Family data keys: ${Object.keys(familyData).join(', ')}`);

            // Add the family ID to the familyData object
            familyData.id = familyId;

            try {
              // Call the chargesCalculator API with error handling
              console.log(`Making API request to calculate charges for family ${familyId}`);
              const response = await axios.post(
                'https://us-central1-studiosync-af73d.cloudfunctions.net/chargesCalculator/calculateFamilyCharges',
                {
                  familyData,
                  studioId
                }
              );
              
              console.log(`Received response from charges calculator API: ${response.status}`);
              
              // Log the entire response data
              console.log(`API response data for family ${familyId}: ${JSON.stringify(response.data, null, 2)}`);
              
              const result = response.data;
              
              if (!result.success) {
                console.log(`API returned error: ${result.error || 'Unknown error'}`);
                continue;
              }
              
              // Get the charge data
              const chargeData = result.chargeData || {};

              // Check if there's an amount to charge
              if (!chargeData.finalTotal || chargeData.finalTotal <= 0) {
                console.log(`No charges to post for family: ${familyId} (amount is ${chargeData.finalTotal || 0})`);
                continue;
              }
              
              console.log(`Posting charge of ${chargeData.finalTotal} for family: ${familyId}`);
              
              // Post charge to ledger with error handling
              try {
                const postedCharge = await postChargeToLedger(studioId, familyId, chargeData);
                
                if (postedCharge) {
                  // Update family balance
                  await familyDoc.ref.update({
                    Balance: admin.firestore.FieldValue.increment(postedCharge.Amount),
                    LastChargeDate: admin.firestore.FieldValue.serverTimestamp(),
                    LastChargeAmount: postedCharge.Amount
                  });
                  
                  studioFamiliesProcessed++;
                  totalFamiliesProcessed++;
                }
              } catch (ledgerError) {
                console.error(`Error posting charge to ledger: ${ledgerError}`);
                throw ledgerError;
              }
            } catch (apiError) {
              console.error(`Error calling charges calculator API: ${apiError}`);
              throw apiError;
            }
            
          } catch (error) {
            console.error(`Error checking for existing charges: ${error}`);
            throw error;
          }
          
        } catch (error) {
          console.error(`❌ Error processing charges for family ${familyId}:`, error);
          
          // Log the error to Firestore for tracking
          await admin.firestore().collection(`Studios/${studioId}/ChargeErrors`).add({
            FamilyId: familyId,
            FamilyName: familyData.FamilyName || `${familyData.FirstName} ${familyData.LastName}`,
            Error: error.message,
            Timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      console.log(`Studio ${studioId} monthly charges summary: ${studioFamiliesProcessed} families processed`);
      studiosProcessed++;
    }
    
    console.log(`🏁 Monthly charges processing complete. Studios processed: ${studiosProcessed}, Total families: ${totalFamiliesProcessed}`);
    
    return {
      studiosProcessed,
      familiesProcessed: totalFamiliesProcessed
    };
    
  } catch (error) {
    console.error("❌ Error in monthly charges processing:", error);
    throw error;
  }
}

// Export the scheduled function with improved configuration
exports.postMonthlyCharges = onSchedule({
  schedule: "0 5 * * *", // Run at 5:00 AM every day
  timeZone: "America/New_York",
  retryCount: 3,
  region: "us-central1",
  memory: "512MiB"
}, async (event) => {
  console.log("Monthly charges scheduled function triggered");
  
  try {
    const result = await processMonthlyCharges();
    console.log("Monthly charges processing completed successfully:", result);
    return result;
  } catch (error) {
    console.error("Monthly charges processing failed:", error);
    throw error;
  }
});

// Export the HTTP endpoint
exports.postChargesHttp = onRequest({
  region: "us-central1",
  memory: "512MiB",
  cors: true,
  invoker: "public"
}, app);

// Also export the function for testing or manual triggering
exports.processMonthlyCharges = processMonthlyCharges;