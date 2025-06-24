const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create an Express app
const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      "https://studiosync-af73d.web.app",
      "https://studiosync-af73d.firebaseapp.com",
      "https://studiosyncdance.com",
      "http://localhost:5000",
    ],
    methods: ["POST", "OPTIONS", "GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json());

// Add a middleware to log all requests
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "unknown"
    }`
  );
  next();
});

// Root endpoint (important for health checks)
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Charges Calculator API is working!",
    timestamp: new Date().toISOString(),
  });
});

// Main endpoint to calculate family charges
app.post("/calculateFamilyCharges", async (req, res) => {
  const logs = [];
  const logAndCapture = (message, data = null) => {
    const logEntry = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logEntry);
    logs.push(logEntry);
  };

  try {
    // Get the request body
    const { familyData, studioId } = req.body;

    logAndCapture(
      `Request received for family: ${
        familyData?.id || familyData?.FamilyId
      } in studio: ${studioId}`
    );

    if (!familyData || !studioId) {
      logAndCapture("Missing required parameters");
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: familyData and studioId",
        logs,
      });
    }

    logAndCapture(
      `Calculating charges for family: ${
        familyData.id || familyData.FamilyId
      } in studio: ${studioId}`
    );

    // Calculate charges logic
    const result = await calculateFamilyCharges(
      familyData,
      studioId,
      logAndCapture
    );

    // Add logs to the result
    result.logs = logs;

    // Set CORS headers explicitly
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Return the result
    logAndCapture("Sending response to client");
    return res.json(result);
  } catch (error) {
    logAndCapture(
      `Error in calculateFamilyCharges API: ${error.message}`,
      error.stack
    );

    // Set CORS headers explicitly
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred",
      logs,
    });
  }
});

/**
 * Helper function to fetch studio data
 */
async function fetchStudioData(studioId, log) {
  log("Fetching studio settings");
  const studioDoc = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .get();

  if (!studioDoc.exists) {
    log(`Studio with ID ${studioId} not found`);
    throw new Error(`Studio with ID ${studioId} not found`);
  }

  const studioData = studioDoc.data();
  log("Studio settings retrieved successfully");
  return studioData;
}

/**
 * Helper function to fetch family document
 */
async function fetchFamilyDocument(studioId, familyId, log) {
  log(`Fetching family document with ID: ${familyId}`);
  const familyDoc = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Families")
    .doc(familyId)
    .get();

  if (!familyDoc.exists) {
    log(`Family with ID ${familyId} not found`);
    throw new Error(`Family with ID ${familyId} not found`);
  }

  const familyData = { id: familyDoc.id, ...familyDoc.data() };
  log("Family document retrieved successfully");
  return familyData;
}

/**
 * Helper function to fetch all students for a family
 */
async function fetchStudentsForFamily(studioId, familyId, log) {
  log("Fetching students for family");
  const studentsSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Students")
    .where("FamilyId", "==", familyId)
    .get();

  log(`Retrieved ${studentsSnapshot.size} students for family`);

  const students = studentsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  log(`Using ${students.length} students for calculation`);
  return students;
}

/**
 * Helper function to fetch all class details for class IDs
 */
async function fetchClassDetails(studioId, classIds, log) {
  log("Fetching class details");
  log(`Found ${classIds.size} unique class IDs`);

  const classesData = [];
  for (const classId of classIds) {
    log(`Fetching class: ${classId}`);
    try {
      const classDoc = await admin
        .firestore()
        .collection("Studios")
        .doc(studioId)
        .collection("Classes")
        .doc(classId)
        .get();

      if (classDoc.exists) {
        const classData = {
          id: classDoc.id,
          ...classDoc.data(),
        };
        log(`Class ${classId} retrieved: ${classData.ClassName || "Unnamed"}`);
        classesData.push(classData);
      } else {
        log(`Class ${classId} not found`);
      }
    } catch (err) {
      log(`Error fetching class ${classId}: ${err.message}`);
    }
  }

  log(`Retrieved ${classesData.length} classes`);
  return classesData;
}

/**
 * Helper function to fetch all rate plans
 */
async function fetchRatePlans(studioId, log) {
  log("Fetching rate plans");
  const ratePlansSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("RatePlans")
    .get();

  const ratePlans = {};
  ratePlansSnapshot.forEach((doc) => {
    ratePlans[doc.id] = { id: doc.id, ...doc.data() };
  });

  log(`Retrieved ${Object.keys(ratePlans).length} rate plans`);
  return ratePlans;
}

/**
 * Helper function to fetch all active discounts
 */
async function fetchDiscounts(studioId, log) {
  log("Fetching active discounts");
  const discountsSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Discounts")
    .where("IsActive", "==", true)
    .get();

  const discounts = discountsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  log(`Retrieved ${discounts.length} active discounts`);
  return discounts;
}

/**
 * Helper function to fetch all active fees
 */
async function fetchFees(studioId, log) {
  log("Fetching active fees");
  const feesSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Fees")
    .where("IsActive", "==", true)
    .get();

  const fees = feesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  log(`Retrieved ${fees.length} active fees`);
  return fees;
}

/**
 * Helper function to fetch StudentFamilyMax settings from the correct collection
 */
async function fetchStudentFamilyMax(studioId, log) {
  log("Checking for StudentFamilyMax settings");

  try {
    // Query the StudentFamilyMax collection for active settings
    const maxSettingsSnapshot = await admin
      .firestore()
      .collection("Studios")
      .doc(studioId)
      .collection("StudentFamilyMax")
      .where("IsActive", "==", true)
      .limit(1) // We only need one active setting
      .get();

    if (!maxSettingsSnapshot.empty) {
      const maxSettings = maxSettingsSnapshot.docs[0].data();
      log(
        `Found StudentFamilyMax settings - Student Max: $${
          maxSettings.StudentMax || 0
        }, Family Max: $${maxSettings.FamilyMax || 0}`
      );
      return {
        StudentMax: maxSettings.StudentMax || 0,
        FamilyMax: maxSettings.FamilyMax || 0,
      };
    } else {
      log("No active StudentFamilyMax settings found");
      return null;
    }
  } catch (error) {
    log(`Error fetching StudentFamilyMax settings: ${error.message}`);
    return null;
  }
}

/**
 * Helper function to fetch family fees
 */
async function fetchFamilyFees(studioId, familyId, log) {
  log("Fetching fees from family document");
  const familyFeesSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Families")
    .doc(familyId)
    .collection("Fees")
    .get();

  const fees = familyFeesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  log(`Retrieved ${fees.length} fees from family document`);
  return fees;
}

/**
 * Helper function to process family fees
 */
function processFamilyFees(fees, currentDate = new Date(), log) {
  log("Processing family fees");
  const processedFees = [];

  fees.forEach((fee) => {
    if (!fee.Schedule || !Array.isArray(fee.Schedule)) {
      log(`Fee ${fee.Name} has no valid schedule, skipping`);
      return;
    }

    if (fee.IsRecurring) {
      // For recurring fees, find the next unpaid scheduled payment
      const nextUnpaidPayment = fee.Schedule.find(
        (s) => s.Status === "Unpaid" && new Date(s.DueDate) >= currentDate
      );

      if (nextUnpaidPayment) {
        log(
          `Found next unpaid recurring payment for ${fee.Name}: $${nextUnpaidPayment.Amount} due ${nextUnpaidPayment.Month}`
        );
        processedFees.push({
          id: fee.id,
          name: fee.Name,
          amount: nextUnpaidPayment.Amount,
          dueDate: nextUnpaidPayment.DueDate,
          month: nextUnpaidPayment.Month,
          type: "Recurring",
          classId: fee.ClassId,
          className: fee.ClassName,
          studentId: fee.StudentId,
          studentName: fee.StudentName,
        });
      }
    } else {
      // For one-time fees, check if there's an unpaid amount
      const unpaidPayment = fee.Schedule.find((s) => s.Status === "Unpaid");

      if (unpaidPayment) {
        // Check if the due date is specified and in the future
        const dueDate = unpaidPayment.DueDate
          ? new Date(unpaidPayment.DueDate)
          : null;
        const shouldChargeNow = !dueDate || dueDate <= currentDate;

        if (shouldChargeNow) {
          log(
            `Found applicable unpaid one-time fee ${fee.Name}: $${unpaidPayment.Amount}`
          );
          processedFees.push({
            id: fee.id,
            name: fee.Name,
            amount: unpaidPayment.Amount,
            dueDate: unpaidPayment.DueDate,
            month: unpaidPayment.Month,
            type: "OneTime",
            classId: fee.ClassId,
            className: fee.ClassName,
            studentId: fee.StudentId,
            studentName: fee.StudentName,
          });
        } else {
          log(
            `Skipping future one-time fee ${fee.Name}, due ${unpaidPayment.Month}`
          );
        }
      }
    }
  });

  log(`Processed ${processedFees.length} applicable fees`);
  return processedFees;
}

/**
 * Calculates charges for a family
 */
async function calculateFamilyCharges(familyData, studioId, log = console.log) {
  try {
    log(
      `Starting charge calculation for family: ${
        familyData.id || familyData.FamilyId
      }`
    );

    // Initialize all variables at the top
    let processedFees = [];
    let totalFees = 0;
    let totalTuition = 0;
    let totalDiscount = 0;
    let studentCharges = [];
    let familyDiscounts = [];
    const logs = []; // Initialize logs array

    // Create a logging function that captures logs
    const logAndCapture = (message) => {
      log(message);
      logs.push(message);
    };

    // Step 1: Fetch all required data
    // Get studio settings
    const studioData = await fetchStudioData(studioId, log);

    // Get StudentFamilyMax settings either from studio document or directly
    let studentFamilyMax = studioData.StudentFamilyMax || null;

    // If no student-family-max in studio document, try fetching from settings collection
    if (!studentFamilyMax) {
      studentFamilyMax = await fetchStudentFamilyMax(studioId, log);
    } else {
      log(
        `Found StudentFamilyMax settings in studio document - Student Max: $${
          studentFamilyMax.StudentMax || 0
        }, Family Max: $${studentFamilyMax.FamilyMax || 0}`
      );
    }

    // Use family document from request or fetch if needed
    let fullFamilyData = familyData;
    if (!familyData.FirstName && familyData.id) {
      const familyId = familyData.id || familyData.FamilyId;
      fullFamilyData = await fetchFamilyDocument(studioId, familyId, log);
    }

    // Get all students for this family
    const familyId = fullFamilyData.id || fullFamilyData.FamilyId;
    const students = await fetchStudentsForFamily(studioId, familyId, log);

    if (students.length === 0) {
      log("No students found for this family");
      return {
        success: true,
        chargeData: {
          students: [],
          totalTuition: 0,
          totalRegistrationFees: 0,
          totalCostumeFees: 0,
          totalOtherFees: 0,
          subtotal: 0,
          discounts: [],
          totalDiscount: 0,
          finalTotal: 0,
          ratePlan: "Monthly",
        },
      };
    }

    // Collect all class IDs from students
    log("Collecting class IDs from students");
    const classIds = new Set();
    students.forEach((student) => {
      if (student.Classes && Array.isArray(student.Classes)) {
        student.Classes.forEach((cls) => classIds.add(cls));
      }
    });

    log(`Found ${classIds.size} unique class IDs`);

    if (classIds.size === 0) {
      log("No classes found for any students");
      return {
        success: true,
        chargeData: {
          students: [],
          totalTuition: 0,
          totalRegistrationFees: 0,
          totalCostumeFees: 0,
          totalOtherFees: 0,
          subtotal: 0,
          discounts: [],
          totalDiscount: 0,
          finalTotal: 0,
          ratePlan: "Monthly",
        },
      };
    }

    // Get class details
    const classesData = await fetchClassDetails(studioId, classIds, log);

    // Get all rate plans
    const ratePlans = await fetchRatePlans(studioId, log);

    // Get all discounts
    const allDiscounts = await fetchDiscounts(studioId, log);

    // Get all fees
    const allFees = await fetchFees(studioId, log);

    // Check for rate plans
    const familyRatePlan =
      fullFamilyData.RatePlan || studioData.DefaultRatePlan || "Monthly";
    const defaultRatePlanId =
      Object.values(ratePlans).find((rp) => rp.Name === familyRatePlan)?.id ||
      Object.keys(ratePlans)[0];

    log(
      `Using rate plan: ${familyRatePlan}, default rate plan ID: ${defaultRatePlanId}`
    );

    // Step 2: Calculate tuition for each student
    log("Beginning student charge calculations");
    for (const student of students) {
      log(
        `Processing student: ${student.FirstName} ${student.LastName} (${student.id})`
      );

      // First, determine relevant rate plans for this student's classes
      const studentClasses = await fetchRelevantClassesForStudent(
        studioId,
        student,
        classesData,
        log
      );
      const relevantRatePlans = determineRelevantRatePlans(
        studentClasses,
        ratePlans,
        defaultRatePlanId,
        log
      );

      // Then calculate tuition
      const tuition = calculateRatePlanTuitionEnhanced(
        student,
        studentClasses,
        ratePlans,
        defaultRatePlanId,
        log
      );
      log(`Base tuition calculated: $${tuition.toFixed(2)}`);

      // Then process class fees
      log("Processing fees");
      const familyFees = await fetchFamilyFees(studioId, familyId, log);
      processedFees = processFamilyFees(familyFees, new Date(), log);
      totalFees = processedFees.reduce((sum, fee) => sum + fee.amount, 0);
      log(`Total fees calculated: $${totalFees.toFixed(2)}`);

      // Calculate student discounts - pass family promo codes to ensure they're applied
      log("Calculating student discounts");
      const familyPromoCodes = fullFamilyData.PromoCodes || [];
      const studentDiscountResult = calculateStudentDiscounts(
        student,
        studentClasses,
        allDiscounts,
        familyPromoCodes
      );
      const studentDiscountTotal = studentDiscountResult.total;
      log(`Student discounts calculated: $${studentDiscountTotal.toFixed(2)}`);

      // Add student to charges
      log("Adding student to charges");
      const studentTotal = tuition + totalFees - studentDiscountTotal;
      studentCharges.push({
        id: student.id,
        name: `${student.FirstName} ${student.LastName}`,
        tuition,
        registrationFees: totalFees,
        costumeFees: 0,
        otherFees: 0,
        discounts: studentDiscountResult.discounts,
        discountTotal: studentDiscountTotal,
        total: studentTotal,
        classes: studentClasses.map((cls) => ({
          id: cls.id,
          name: cls.ClassName || "Unnamed Class",
        })),
        relevantRatePlans,
      });

      totalTuition += tuition;
      log(
        `Student processing complete. Student total: $${studentCharges[
          studentCharges.length - 1
        ].total.toFixed(2)}`
      );
    }

    // Apply family-level discounts
    log("Applying family-level discounts");

    // Check for family-specific discounts
    const familySpecificDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Family" &&
        discount.AssociationItemId === familyData.id
    );

    log(`Found ${familySpecificDiscounts.length} family-specific discounts`);

    // Apply family discounts
    familySpecificDiscounts.forEach((discount) => {
      let discountAmount = 0;

      if (discount.DiscountType === "Percentage") {
        discountAmount = (totalTuition * discount.Amount) / 100;
        log(
          `Applied percentage family discount: ${discount.Name}, ${
            discount.Amount
          }% of $${totalTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
        );
      } else {
        // Fixed amount
        discountAmount = parseFloat(discount.Amount) || 0;
        log(
          `Applied fixed family discount: ${
            discount.Name
          }, $${discountAmount.toFixed(2)}`
        );
      }

      totalDiscount += discountAmount;
      familyDiscounts.push({
        name: discount.Name,
        type: "Family",
        amount: discountAmount,
      });
    });

    // Check for multi-student discounts in rate plans
    if (students.length > 1 && ratePlans) {
      log(
        `Checking for multi-student discounts with ${students.length} students`
      );

      // Find rate plans with family discounts
      Object.values(ratePlans).forEach((ratePlan) => {
        if (
          ratePlan.FamilyDiscount &&
          ratePlan.FamilyDiscount.StudentThreshold &&
          ratePlan.FamilyDiscount.Amount
        ) {
          const threshold = ratePlan.FamilyDiscount.StudentThreshold;
          const amount = ratePlan.FamilyDiscount.Amount;
          const type = ratePlan.FamilyDiscount.Type || "percentage";

          log(
            `Found family discount in rate plan ${ratePlan.Name}: ${amount}${
              type === "percentage" ? "%" : "$"
            } for ${threshold}+ students`
          );

          if (students.length >= threshold) {
            let discountAmount = 0;

            if (type === "percentage") {
              discountAmount = (totalTuition * amount) / 100;
              log(
                `Applied percentage multi-student discount: ${amount}% of $${totalTuition.toFixed(
                  2
                )} = $${discountAmount.toFixed(2)}`
              );
            } else {
              // Fixed amount
              discountAmount = parseFloat(amount) || 0;
              log(
                `Applied fixed multi-student discount: $${discountAmount.toFixed(
                  2
                )}`
              );
            }

            totalDiscount += discountAmount;
            familyDiscounts.push({
              name: `Multi-Student Discount (${ratePlan.Name})`,
              type: "MultiStudent",
              amount: discountAmount,
            });
          }
        }
      });
    }

    // Check for promo codes applied at the family level
    const familyPromoCodes = fullFamilyData.PromoCodes || [];
    if (familyPromoCodes.length > 0) {
      log(`Family has promo codes: ${familyPromoCodes.join(", ")}`);

      const codeDiscounts = allDiscounts.filter(
        (discount) =>
          discount.IsActive &&
          discount.AssociationType === "Code" &&
          familyPromoCodes.some(
            (code) =>
              code.toUpperCase() === discount.DiscountCode?.toUpperCase()
          )
      );

      log(`Found ${codeDiscounts.length} family promo code discounts`);

      codeDiscounts.forEach((discount) => {
        let discountAmount = 0;

        if (discount.DiscountType === "Percentage") {
          discountAmount = (totalTuition * discount.Amount) / 100;
          log(
            `Applied percentage family promo code discount: ${discount.Name}, ${
              discount.Amount
            }% of $${totalTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
          );
        } else {
          // Fixed amount
          discountAmount = parseFloat(discount.Amount) || 0;
          log(
            `Applied fixed family promo code discount: ${
              discount.Name
            }, $${discountAmount.toFixed(2)}`
          );
        }

        totalDiscount += discountAmount;
        familyDiscounts.push({
          name: discount.Name,
          type: "FamilyPromoCode",
          code: discount.DiscountCode,
          amount: discountAmount,
        });
      });
    } else {
      log("Family has promo codes: none");
    }

    // Add student-level discounts to total
    log("Adding student-level discounts to total");
    studentCharges.forEach((student) => {
      if (student.discountTotal > 0) {
        totalDiscount += student.discountTotal;
        log(
          `Added student discount: $${student.discountTotal.toFixed(
            2
          )}, total discount now: $${totalDiscount.toFixed(2)}`
        );
      }
    });

    // Create the summary at the end
    logAndCapture("=== Charges Calculation Summary ===");
    logAndCapture(`Base Tuition: $${totalTuition.toFixed(2)}`);

    // List all fees using the stored processedFees
    logAndCapture("Fees:");
    processedFees.forEach((fee) => {
      logAndCapture(
        `- ${fee.name}: $${fee.amount.toFixed(2)} (${fee.type}) due ${
          fee.month
        }`
      );
    });
    logAndCapture(`Total Fees: $${totalFees.toFixed(2)}`);

    // List all discounts
    logAndCapture("Discounts:");
    if (familyDiscounts && familyDiscounts.length > 0) {
      familyDiscounts.forEach((discount) => {
        logAndCapture(
          `- ${discount.name}: -$${discount.amount.toFixed(2)} (${
            discount.type
          })`
        );
      });
    }
    if (studentCharges) {
      studentCharges.forEach((student) => {
        if (student.discounts && student.discounts.length > 0) {
          logAndCapture(`Discounts for ${student.name}:`);
          student.discounts.forEach((discount) => {
            logAndCapture(
              `- ${discount.name}: -$${discount.amount.toFixed(2)}`
            );
          });
        }
      });
    }
    logAndCapture(`Total Discounts: -$${totalDiscount.toFixed(2)}`);

    // Final total
    const finalTotal = totalTuition + totalFees - totalDiscount;
    logAndCapture(`Final Total: $${finalTotal.toFixed(2)}`);
    logAndCapture("===============================");

    // Return the result with all the details
    return {
      success: true,
      chargeData: {
        students: studentCharges,
        totalTuition,
        totalFees,
        fees: processedFees,
        discounts: familyDiscounts,
        totalDiscount,
        finalTotal,
        ratePlan: familyRatePlan,
      },
      logs,
    };
  } catch (error) {
    console.error(
      `Error in calculateFamilyCharges: ${error.message}`,
      error.stack
    );
    return {
      success: false,
      error: error.message || "An unexpected error occurred",
      logs: [], // Return empty logs array in case of error
    };
  }
}

/**
 * Helper function to fetch relevant classes for a student
 */
async function fetchRelevantClassesForStudent(
  studioId,
  student,
  allClasses,
  log
) {
  log(
    `Fetching relevant classes for student: ${student.FirstName} ${student.LastName} (${student.id})`
  );

  if (
    !student.Classes ||
    !Array.isArray(student.Classes) ||
    student.Classes.length === 0
  ) {
    log(`Student has no classes assigned`);
    return [];
  }

  log(`Student has ${student.Classes.length} classes assigned`);

  // Find the class details from the pre-fetched classes
  const relevantClasses = [];
  for (const classId of student.Classes) {
    const classData = allClasses.find((cls) => cls.id === classId);
    if (classData) {
      log(
        `Found class data for ${classId}: ${classData.ClassName || "Unnamed"}`
      );
      relevantClasses.push(classData);
    } else {
      log(`Class data not found for ${classId}, skipping`);
    }
  }

  log(`Retrieved ${relevantClasses.length} relevant classes for student`);
  return relevantClasses;
}

/**
 * Helper function to determine relevant rate plans for classes
 */
function determineRelevantRatePlans(
  studentClasses,
  allRatePlans,
  defaultRatePlanId,
  log
) {
  log(`Determining relevant rate plans for ${studentClasses.length} classes`);

  const relevantRatePlans = new Map();

  for (const classData of studentClasses) {
    // Check if class has a specific rate plan assigned
    const ratePlanId = classData.RatePlanId || defaultRatePlanId;

    if (ratePlanId && allRatePlans[ratePlanId]) {
      if (!relevantRatePlans.has(ratePlanId)) {
        log(
          `Adding rate plan ${ratePlanId} (${
            allRatePlans[ratePlanId].Name || "Unnamed"
          }) for class ${classData.ClassName || classData.id}`
        );
        relevantRatePlans.set(ratePlanId, {
          ratePlan: allRatePlans[ratePlanId],
          classes: [classData],
          totalHours: classData.Duration ? classData.Duration / 60 : 1, // Convert minutes to hours, default to 1
        });
      } else {
        // Add this class to the existing rate plan entry
        const existingEntry = relevantRatePlans.get(ratePlanId);
        existingEntry.classes.push(classData);
        existingEntry.totalHours += classData.Duration
          ? classData.Duration / 60
          : 1;
        log(
          `Added class ${
            classData.ClassName || classData.id
          } to rate plan ${ratePlanId}, total hours now: ${
            existingEntry.totalHours
          }`
        );
      }
    } else {
      log(
        `No valid rate plan found for class ${
          classData.ClassName || classData.id
        }, using default`
      );
      // If no valid rate plan, use default
      if (
        !relevantRatePlans.has(defaultRatePlanId) &&
        allRatePlans[defaultRatePlanId]
      ) {
        relevantRatePlans.set(defaultRatePlanId, {
          ratePlan: allRatePlans[defaultRatePlanId],
          classes: [classData],
          totalHours: classData.Duration ? classData.Duration / 60 : 1,
        });
      } else if (allRatePlans[defaultRatePlanId]) {
        // Add to default rate plan
        const existingEntry = relevantRatePlans.get(defaultRatePlanId);
        existingEntry.classes.push(classData);
        existingEntry.totalHours += classData.Duration
          ? classData.Duration / 60
          : 1;
      }
    }
  }

  log(
    `Determined ${relevantRatePlans.size} relevant rate plans for these classes`
  );
  return Object.fromEntries(relevantRatePlans);
}

/**
 * Enhanced version of calculateRatePlanTuition that uses the new helper functions
 */
function calculateRatePlanTuitionEnhanced(
  student,
  studentClasses,
  allRatePlans,
  defaultRatePlanId,
  log = console.log
) {
  log(`calculateRatePlanTuition for student ${student.id}`);
  log(`Student details: "${student.FirstName}" "${student.LastName}"`);

  if (!studentClasses || studentClasses.length === 0) {
    log("No classes found for calculation, returning 0");
    return 0;
  }

  // Prepare classes with necessary info for calculation
  const classesForCalc = studentClasses.map((cls) => ({
    id: cls.id,
    name: cls.ClassName || "Unnamed Class",
    duration: cls.Duration || 60, // Default to 60 minutes if not specified
    ratePlanId: cls.RatePlanId || defaultRatePlanId,
  }));

  log(`Classes for calculation: ${JSON.stringify(classesForCalc)}`);

  // Group classes by rate plan
  const classesByRatePlan = {};

  classesForCalc.forEach((cls) => {
    const ratePlanId = cls.ratePlanId;
    const hoursForClass = cls.duration / 60; // Convert minutes to hours

    if (!classesByRatePlan[ratePlanId]) {
      classesByRatePlan[ratePlanId] = { hours: 0, classes: [] };
    }

    classesByRatePlan[ratePlanId].hours += hoursForClass;
    classesByRatePlan[ratePlanId].classes.push(cls);

    log(
      `Added class ${cls.name}: ${hoursForClass} hours to rate plan ${ratePlanId}, total now: ${classesByRatePlan[ratePlanId].hours}`
    );
  });

  // Calculate tuition for each rate plan
  let totalTuition = 0;

  for (const [ratePlanId, data] of Object.entries(classesByRatePlan)) {
    const ratePlan = allRatePlans[ratePlanId];

    if (!ratePlan) {
      log(`Rate plan ${ratePlanId} not found, skipping`);
      continue;
    }

    log(`Processing rate plan: ${ratePlan.Name || ratePlanId}`);
    log(`Rate plan structure: ${JSON.stringify(ratePlan, null, 2)}`);
    log(`Rate plan hours: ${data.hours}`);

    // Calculate cost based on hours
    const cost = calculateRatePlanCost(data.hours, ratePlan);
    log(
      `Rate plan cost: $${cost.toFixed(2)}, total tuition now: $${(
        totalTuition + cost
      ).toFixed(2)}`
    );

    totalTuition += cost;
  }

  log(`Rate plan tuition calculated: $${totalTuition.toFixed(2)}`);
  return totalTuition;
}

// Helper function to calculate rate plan tuition
function calculateRatePlanTuition(student, classes, ratePlans) {
  console.log(`calculateRatePlanTuition for student ${student.id}`);
  console.log(
    `Student details: ${JSON.stringify(student.FirstName)} ${JSON.stringify(
      student.LastName
    )}`
  );

  if (!classes || classes.length === 0) {
    console.log("No classes provided, returning 0");
    return 0;
  }

  console.log(
    `Classes for calculation: ${JSON.stringify(
      classes.map((c) => ({
        id: c.id,
        name: c.Name || c.ClassName,
        duration: c.Duration || 60,
        ratePlanId: c.RatePlanId,
      }))
    )}`
  );

  // Group classes by rate plan
  const hoursByRatePlan = {};
  const classesByRatePlan = {};

  classes.forEach((cls) => {
    const ratePlanId = cls.RatePlanId;
    const hours = (cls.Duration || 60) / 60; // Convert minutes to hours

    if (!hoursByRatePlan[ratePlanId]) {
      hoursByRatePlan[ratePlanId] = 0;
      classesByRatePlan[ratePlanId] = [];
    }

    hoursByRatePlan[ratePlanId] += hours;
    classesByRatePlan[ratePlanId].push(cls);
    console.log(
      `Added class ${
        cls.Name || cls.ClassName || cls.id
      }: ${hours} hours to rate plan ${ratePlanId}, total now: ${
        hoursByRatePlan[ratePlanId]
      }`
    );
  });

  // If no rate plans assigned, use class fees directly
  if (Object.keys(hoursByRatePlan).length === 0) {
    const totalFees = classes.reduce((sum, cls) => sum + (cls.Tuition || 0), 0);
    console.log(
      `No rate plans assigned, using direct fees: $${totalFees.toFixed(2)}`
    );
    return totalFees;
  }

  // Calculate tuition for each rate plan
  let totalTuition = 0;

  Object.entries(hoursByRatePlan).forEach(([ratePlanId, totalHours]) => {
    if (!ratePlanId) {
      console.log("Skipping classes with no rate plan");
      return;
    }

    const ratePlan = ratePlans[ratePlanId];
    if (!ratePlan) {
      console.log(`Rate plan ${ratePlanId} not found in available rate plans`);
      console.log(`Available rate plans: ${Object.keys(ratePlans).join(", ")}`);
      return;
    }

    console.log(`Processing rate plan: ${ratePlan.Name || ratePlanId}`);
    console.log(`Rate plan structure:`, JSON.stringify(ratePlan, null, 2));
    console.log(`Rate plan hours: ${totalHours}`);

    // Calculate cost based on rate plan
    const cost = calculateRatePlanCost(totalHours, ratePlan);
    totalTuition += cost;

    console.log(
      `Rate plan cost: $${cost.toFixed(
        2
      )}, total tuition now: $${totalTuition.toFixed(2)}`
    );
  });

  return totalTuition;
}

// Helper function to calculate rate plan cost
function calculateRatePlanCost(hours, ratePlan) {
  console.log(`calculateRatePlanCost for ${hours} hours`);
  console.log(`Rate plan details: ${JSON.stringify(ratePlan)}`);

  // Check if we have HourRates (new structure) or Tiers (old structure)
  const hasHourRates =
    ratePlan &&
    ratePlan.HourRates &&
    Array.isArray(ratePlan.HourRates) &&
    ratePlan.HourRates.length > 0;
  const hasTiers =
    ratePlan &&
    ratePlan.Tiers &&
    Array.isArray(ratePlan.Tiers) &&
    ratePlan.Tiers.length > 0;

  if (!hasHourRates && !hasTiers) {
    console.log(
      "No rate structure found (neither HourRates nor Tiers), returning 0"
    );
    return 0;
  }

  if (hasHourRates) {
    console.log(`Found ${ratePlan.HourRates.length} hour rates`);

    // Sort hour rates by hours (ascending)
    const sortedRates = [...ratePlan.HourRates].sort(
      (a, b) => a.Hours - b.Hours
    );
    console.log(`Sorted hour rates: ${JSON.stringify(sortedRates)}`);

    // Find the applicable rate
    const applicableRate = sortedRates.find((rate) => hours <= rate.Hours);
    if (applicableRate) {
      console.log(
        `Found applicable rate: ${hours} hours <= ${
          applicableRate.Hours
        } hours, rate: $${applicableRate.Rate.toFixed(2)}`
      );
      return applicableRate.Rate;
    } else if (sortedRates.length > 0) {
      // If no rate matches, use the highest rate
      const highestRate = sortedRates[sortedRates.length - 1];
      console.log(
        `No matching rate, using highest rate: ${
          highestRate.Hours
        } hours, rate: $${highestRate.Rate.toFixed(2)}`
      );
      return highestRate.Rate;
    }
  } else if (hasTiers) {
    console.log(`Found ${ratePlan.Tiers.length} tiers`);

    // Sort tiers by hours (ascending)
    const sortedTiers = [...ratePlan.Tiers].sort((a, b) => a.Hours - b.Hours);
    console.log(`Sorted tiers: ${JSON.stringify(sortedTiers)}`);

    // Find the applicable tier
    const applicableTier = sortedTiers.find((tier) => hours <= tier.Hours);
    if (applicableTier) {
      console.log(
        `Found applicable tier: ${hours} hours <= ${
          applicableTier.Hours
        } hours, cost: $${applicableTier.Cost.toFixed(2)}`
      );
      return applicableTier.Cost;
    } else if (sortedTiers.length > 0) {
      // If no tier matches, use the highest tier
      const highestTier = sortedTiers[sortedTiers.length - 1];
      console.log(
        `No matching tier, using highest tier: ${
          highestTier.Hours
        } hours, cost: $${highestTier.Cost.toFixed(2)}`
      );
      return highestTier.Cost;
    }
  }

  console.log("No applicable rate found, returning 0");
  return 0;
}

// Updated function to handle class fees correctly
function getClassFees(classDoc) {
  console.log(`Getting fees for class: ${classDoc.ClassName || classDoc.id}`);

  // Initialize return object with a single class fee total
  const feeResult = {
    classFeeTotal: 0,
  };

  // Extract fees from Fee array if present
  if (classDoc.Fee && Array.isArray(classDoc.Fee) && classDoc.Fee.length > 0) {
    console.log(
      `Found ${classDoc.Fee.length} fees in class document: ${JSON.stringify(
        classDoc.Fee
      )}`
    );

    classDoc.Fee.forEach((fee) => {
      const amount = fee.FeeAmount || 0;
      const type = fee.FeeType || "Recurring";
      const name = fee.Name || "";

      console.log(
        `Processing class fee: Amount: $${amount.toFixed(
          2
        )}, Type: ${type}, Name: ${name}`
      );

      // All fees in the class.Fee array are considered "class fees"
      feeResult.classFeeTotal += amount;
      console.log(
        `Added to class fees, total now: $${feeResult.classFeeTotal.toFixed(2)}`
      );
    });
  } else {
    console.log("No fees found in class document");
  }

  return feeResult;
}

// Update the function to get fees from the Fees collection
function getRelevantFees(student, classes, allFees) {
  console.log(
    `Getting relevant fees for student: ${student.FirstName} ${student.LastName}`
  );

  // Initialize fee categories
  const feesByCategory = {
    registrationFees: [],
    costumeFees: [],
    otherFees: [],
  };

  if (!allFees || !Array.isArray(allFees) || allFees.length === 0) {
    console.log("No fees available in Fees collection");
    return feesByCategory;
  }

  // Get all class IDs and season IDs for this student
  const classIds = classes.map((cls) => cls.id);
  const seasonIds = classes.map((cls) => cls.SeasonId).filter((id) => id);

  console.log(`Student has classes: ${classIds.join(", ")}`);
  console.log(`Student has seasons: ${seasonIds.join(", ")}`);

  // Filter fees that are relevant to this student
  const relevantFees = allFees.filter((fee) => {
    // Check if fee is active
    if (!fee.IsActive) {
      console.log(`Fee ${fee.Name} is inactive, skipping`);
      return false;
    }

    // Check association type
    switch (fee.AssociationType) {
      case "Student":
        // Fee is associated with this specific student
        const isStudentFee = fee.AssociationItemId === student.id;
        if (isStudentFee) {
          console.log(`Fee ${fee.Name} is associated with this student`);
        }
        return isStudentFee;

      case "Family":
        // Fee is associated with this student's family
        const isFamilyFee = fee.AssociationItemId === student.FamilyId;
        if (isFamilyFee) {
          console.log(
            `Fee ${fee.Name} is associated with this student's family`
          );
        }
        return isFamilyFee;

      case "Class":
        // Fee is associated with one of the student's classes
        const isClassFee = classIds.includes(fee.AssociationItemId);
        if (isClassFee) {
          console.log(
            `Fee ${fee.Name} is associated with class ${fee.AssociationItemId}`
          );
        }
        return isClassFee;

      case "Season":
        // Fee is associated with one of the student's seasons
        const isSeasonFee = seasonIds.includes(fee.AssociationItemId);
        if (isSeasonFee) {
          console.log(
            `Fee ${fee.Name} is associated with season ${fee.AssociationItemId}`
          );
        }
        return isSeasonFee;

      case "Global":
        // Global fees apply to all students
        console.log(`Fee ${fee.Name} is a global fee`);
        return true;

      default:
        console.log(
          `Fee ${fee.Name} has unknown association type: ${fee.AssociationType}`
        );
        return false;
    }
  });

  console.log(
    `Found ${relevantFees.length} relevant fees for student from Fees collection`
  );

  // Categorize the fees based on their name
  relevantFees.forEach((fee) => {
    const feeName = fee.Name ? fee.Name.toLowerCase() : "";
    const feeAmount = parseFloat(fee.Amount) || 0;

    // Put fee in appropriate category
    if (feeName.includes("registr") || feeName.includes("regist")) {
      feesByCategory.registrationFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
      console.log(
        `Added ${fee.Name} as registration fee: $${feeAmount.toFixed(2)}`
      );
    } else if (feeName.includes("costume")) {
      feesByCategory.costumeFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
      console.log(`Added ${fee.Name} as costume fee: $${feeAmount.toFixed(2)}`);
    } else {
      feesByCategory.otherFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
      console.log(`Added ${fee.Name} as other fee: $${feeAmount.toFixed(2)}`);
    }
  });

  return feesByCategory;
}

// Modified to handle promo codes correctly
function calculateStudentDiscounts(
  student,
  classes,
  allDiscounts,
  promoCodes = []
) {
  console.log(
    `Calculating discounts for student: ${student.FirstName} ${student.LastName}`
  );

  if (
    !classes ||
    classes.length === 0 ||
    !allDiscounts ||
    !Array.isArray(allDiscounts)
  ) {
    console.log("No classes or discounts available");
    return { discounts: [], total: 0 };
  }

  let totalDiscount = 0;
  const appliedDiscounts = [];

  // Get all class IDs and season IDs
  const classIds = classes.map((cls) => cls.id);
  const seasonIds = classes.map((cls) => cls.SeasonId).filter((id) => id);

  console.log(`Student has classes: ${classIds.join(", ")}`);
  console.log(`Student has seasons: ${seasonIds.join(", ")}`);

  // Get promo codes from student and family
  const studentPromoCodes = student.PromoCodes || [];
  const familyPromoCodes = student.FamilyPromoCodes || [];
  // Include any additional promo codes passed to the function
  const allPromoCodes = [
    ...studentPromoCodes,
    ...familyPromoCodes,
    ...(promoCodes || []),
  ];

  if (allPromoCodes.length > 0) {
    console.log(`Student has promo codes: ${allPromoCodes.join(", ")}`);
  } else {
    console.log("Student has promo codes: none");
  }

  // Process class-specific discounts
  classes.forEach((classObj) => {
    console.log(
      `Processing discounts for class: ${classObj.ClassName || classObj.id}`
    );

    // Find discounts for this class
    const classDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Class" &&
        discount.AssociationItemId === classObj.id
    );

    console.log(`Found ${classDiscounts.length} class-specific discounts`);

    // Find discounts for this class's season
    const seasonDiscounts = classObj.SeasonId
      ? allDiscounts.filter(
          (discount) =>
            discount.IsActive &&
            discount.AssociationType === "Season" &&
            discount.AssociationItemId === classObj.SeasonId
        )
      : [];

    console.log(`Found ${seasonDiscounts.length} season-specific discounts`);

    // Calculate class tuition for percentage discounts
    const classTuition = classObj.Tuition || 0;
    console.log(`Class tuition: $${classTuition.toFixed(2)}`);

    // Apply class discounts
    classDiscounts.forEach((discount) => {
      let discountAmount = 0;

      if (discount.DiscountType === "Percentage") {
        discountAmount = (classTuition * discount.Amount) / 100;
        console.log(
          `Applied percentage discount: ${discount.Name}, ${
            discount.Amount
          }% of $${classTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
        );
      } else {
        // Fixed amount
        discountAmount = parseFloat(discount.Amount) || 0;
        console.log(
          `Applied fixed discount: ${discount.Name}, $${discountAmount.toFixed(
            2
          )}`
        );
      }

      totalDiscount += discountAmount;
      appliedDiscounts.push({
        name: discount.Name,
        type: "Class",
        className: classObj.ClassName || classObj.id,
        amount: discountAmount,
      });
    });

    // Apply season discounts
    seasonDiscounts.forEach((discount) => {
      let discountAmount = 0;

      if (discount.DiscountType === "Percentage") {
        discountAmount = (classTuition * discount.Amount) / 100;
        console.log(
          `Applied percentage season discount: ${discount.Name}, ${
            discount.Amount
          }% of $${classTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
        );
      } else {
        // Fixed amount
        discountAmount = parseFloat(discount.Amount) || 0;
        console.log(
          `Applied fixed season discount: ${
            discount.Name
          }, $${discountAmount.toFixed(2)}`
        );
      }

      totalDiscount += discountAmount;
      appliedDiscounts.push({
        name: discount.Name,
        type: "Season",
        className: classObj.ClassName || classObj.id,
        amount: discountAmount,
      });
    });
  });

  // Apply student-specific discounts
  const studentDiscounts = allDiscounts.filter(
    (discount) =>
      discount.IsActive &&
      discount.AssociationType === "Student" &&
      discount.AssociationItemId === student.id
  );

  console.log(`Found ${studentDiscounts.length} student-specific discounts`);

  // Calculate total tuition for percentage discounts
  const totalTuition = classes.reduce(
    (sum, cls) => sum + (cls.Tuition || 0),
    0
  );
  console.log(`Total tuition for all classes: $${totalTuition.toFixed(2)}`);

  studentDiscounts.forEach((discount) => {
    let discountAmount = 0;

    if (discount.DiscountType === "Percentage") {
      discountAmount = (totalTuition * discount.Amount) / 100;
      console.log(
        `Applied percentage student discount: ${discount.Name}, ${
          discount.Amount
        }% of $${totalTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
      );
    } else {
      // Fixed amount
      discountAmount = parseFloat(discount.Amount) || 0;
      console.log(
        `Applied fixed student discount: ${
          discount.Name
        }, $${discountAmount.toFixed(2)}`
      );
    }

    totalDiscount += discountAmount;
    appliedDiscounts.push({
      name: discount.Name,
      type: "Student",
      amount: discountAmount,
    });
  });

  // Apply promo code discounts - CRITICAL CHANGE TO MATCH CLIENT BEHAVIOR
  if (allPromoCodes.length > 0) {
    const codeDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Code" &&
        allPromoCodes.some(
          (code) => code.toUpperCase() === discount.DiscountCode?.toUpperCase()
        )
    );

    console.log(`Found ${codeDiscounts.length} promo code discounts`);

    codeDiscounts.forEach((discount) => {
      let discountAmount = 0;

      if (discount.DiscountType === "Percentage") {
        discountAmount = (totalTuition * discount.Amount) / 100;
        console.log(
          `Applied percentage promo code discount: ${discount.Name}, ${
            discount.Amount
          }% of $${totalTuition.toFixed(2)} = $${discountAmount.toFixed(2)}`
        );
      } else {
        // Fixed amount
        discountAmount = parseFloat(discount.Amount) || 0;
        console.log(
          `Applied fixed promo code discount: ${
            discount.Name
          }, $${discountAmount.toFixed(2)}`
        );
      }

      totalDiscount += discountAmount;
      appliedDiscounts.push({
        name: discount.Name,
        type: "PromoCode",
        code: discount.DiscountCode,
        amount: discountAmount,
      });
    });
  }

  console.log(`Total discounts applied: $${totalDiscount.toFixed(2)}`);
  return { discounts: appliedDiscounts, total: totalDiscount };
}

// Export the Express app as a Firebase Function v2
exports.chargesCalculator = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 60,
    invoker: "public", // Allow unauthenticated access
  },
  app
);
