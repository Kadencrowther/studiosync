const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// --- Firebase Initialization ---
if (!admin.apps.length) admin.initializeApp();

// --- Express App Setup ---
const app = express();
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
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "unknown"
    }`
  );
  next();
});

// --- Health Check Endpoint ---
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Charges Calculator API is working!",
    timestamp: new Date().toISOString(),
  });
});

// --- Main Charges Calculation Endpoint ---
app.post("/calculateFamilyCharges", async (req, res) => {
  const logs = [];
  const logAndCapture = (message, data = null) => {
    const logEntry = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logEntry);
    logs.push(logEntry);
  };

  try {
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
    const result = await calculateFamilyCharges(
      familyData,
      studioId,
      logAndCapture
    );
    result.logs = logs;

    setCORSHeaders(res);
    logAndCapture("Sending response to client");
    return res.json(result);
  } catch (error) {
    logAndCapture(
      `Error in calculateFamilyCharges API: ${error.message}`,
      error.stack
    );
    setCORSHeaders(res);
    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred",
      logs,
    });
  }
});

// --- Helper: Set CORS Headers ---
function setCORSHeaders(res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// --- Firestore Fetch Helpers ---
async function fetchStudioData(studioId, log) {
  log("Fetching studio settings");
  const studioDoc = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .get();
  if (!studioDoc.exists)
    throw new Error(`Studio with ID ${studioId} not found`);
  log("Studio settings retrieved successfully");
  return studioDoc.data();
}

async function fetchFamilyDocument(studioId, familyId, log) {
  log(`Fetching family document with ID: ${familyId}`);
  const familyDoc = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Families")
    .doc(familyId)
    .get();
  if (!familyDoc.exists)
    throw new Error(`Family with ID ${familyId} not found`);
  log("Family document retrieved successfully");
  return { id: familyDoc.id, ...familyDoc.data() };
}

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
        const classData = { id: classDoc.id, ...classDoc.data() };
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

async function fetchFees(studioId, log) {
  log("Fetching active fees");
  const feesSnapshot = await admin
    .firestore()
    .collection("Studios")
    .doc(studioId)
    .collection("Fees")
    .where("IsActive", "==", true)
    .get();
  const fees = feesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  log(`Retrieved ${fees.length} active fees`);
  return fees;
}

async function fetchStudentFamilyMax(studioId, log) {
  log("Checking for StudentFamilyMax settings");
  try {
    const maxSettingsSnapshot = await admin
      .firestore()
      .collection("Studios")
      .doc(studioId)
      .collection("StudentFamilyMax")
      .where("IsActive", "==", true)
      .limit(1)
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

// --- Fee Processing ---
function processFamilyFees(fees, currentDate = new Date(), log) {
  log("Processing family fees");
  const processedFees = [];
  fees.forEach((fee) => {
    if (!fee.Schedule || !Array.isArray(fee.Schedule)) {
      log(`Fee ${fee.Name} has no valid schedule, skipping`);
      return;
    }
    if (fee.IsRecurring) {
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
      const unpaidPayment = fee.Schedule.find((s) => s.Status === "Unpaid");
      if (unpaidPayment) {
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

// --- Main Calculation Logic ---
async function calculateFamilyCharges(familyData, studioId, log = console.log) {
  try {
    log(
      `Starting charge calculation for family: ${
        familyData.id || familyData.FamilyId
      }`
    );
    let processedFees = [],
      totalFees = 0,
      totalTuition = 0,
      totalDiscount = 0;
    let studentCharges = [],
      familyDiscounts = [];
    const logs = [];
    const logAndCapture = (message) => {
      log(message);
      logs.push(message);
    };

    // Fetch all required data
    const studioData = await fetchStudioData(studioId, log);
    let studentFamilyMax = studioData.StudentFamilyMax || null;
    if (!studentFamilyMax)
      studentFamilyMax = await fetchStudentFamilyMax(studioId, log);

    let fullFamilyData = familyData;
    if (!familyData.FirstName && familyData.id) {
      const familyId = familyData.id || familyData.FamilyId;
      fullFamilyData = await fetchFamilyDocument(studioId, familyId, log);
    }
    const familyId = fullFamilyData.id || fullFamilyData.FamilyId;
    const students = await fetchStudentsForFamily(studioId, familyId, log);

    if (students.length === 0) return emptyChargeResult();

    // Collect all class IDs from students
    log("Collecting class IDs from students");
    const classIds = new Set();
    students.forEach((student) => {
      if (student.Classes && Array.isArray(student.Classes))
        student.Classes.forEach((cls) => classIds.add(cls));
    });
    log(`Found ${classIds.size} unique class IDs`);
    if (classIds.size === 0) return emptyChargeResult();

    // Fetch more data
    const classesData = await fetchClassDetails(studioId, classIds, log);
    const ratePlans = await fetchRatePlans(studioId, log);
    const allDiscounts = await fetchDiscounts(studioId, log);
    const allFees = await fetchFees(studioId, log);

    const familyRatePlan =
      fullFamilyData.RatePlan || studioData.DefaultRatePlan || "Monthly";
    const defaultRatePlanId =
      Object.values(ratePlans).find((rp) => rp.Name === familyRatePlan)?.id ||
      Object.keys(ratePlans)[0];
    log(
      `Using rate plan: ${familyRatePlan}, default rate plan ID: ${defaultRatePlanId}`
    );

    // Calculate tuition for each student
    log("Beginning student charge calculations");
    for (const student of students) {
      log(
        `Processing student: ${student.FirstName} ${student.LastName} (${student.id})`
      );
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
      const tuition = calculateRatePlanTuitionEnhanced(
        student,
        studentClasses,
        ratePlans,
        defaultRatePlanId,
        log
      );
      log(`Base tuition calculated: $${tuition.toFixed(2)}`);
      log("Processing fees");
      const familyFees = await fetchFamilyFees(studioId, familyId, log);
      processedFees = processFamilyFees(familyFees, new Date(), log);
      totalFees = processedFees.reduce((sum, fee) => sum + fee.amount, 0);
      log(`Total fees calculated: $${totalFees.toFixed(2)}`);
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

    // Family-level discounts
    log("Applying family-level discounts");
    const familySpecificDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Family" &&
        discount.AssociationItemId === familyData.id
    );
    log(`Found ${familySpecificDiscounts.length} family-specific discounts`);
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

    // Multi-student discounts in rate plans
    if (students.length > 1 && ratePlans) {
      log(
        `Checking for multi-student discounts with ${students.length} students`
      );
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

    // Promo codes at family level
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

    // Summary
    logAndCapture("=== Charges Calculation Summary ===");
    logAndCapture(`Base Tuition: $${totalTuition.toFixed(2)}`);
    logAndCapture("Fees:");
    processedFees.forEach((fee) =>
      logAndCapture(
        `- ${fee.name}: $${fee.amount.toFixed(2)} (${fee.type}) due ${
          fee.month
        }`
      )
    );
    logAndCapture(`Total Fees: $${totalFees.toFixed(2)}`);
    logAndCapture("Discounts:");
    if (familyDiscounts && familyDiscounts.length > 0) {
      familyDiscounts.forEach((discount) =>
        logAndCapture(
          `- ${discount.name}: -$${discount.amount.toFixed(2)} (${
            discount.type
          })`
        )
      );
    }
    if (studentCharges) {
      studentCharges.forEach((student) => {
        if (student.discounts && student.discounts.length > 0) {
          logAndCapture(`Discounts for ${student.name}:`);
          student.discounts.forEach((discount) =>
            logAndCapture(`- ${discount.name}: -$${discount.amount.toFixed(2)}`)
          );
        }
      });
    }
    logAndCapture(`Total Discounts: -$${totalDiscount.toFixed(2)}`);
    const finalTotal = totalTuition + totalFees - totalDiscount;
    logAndCapture(`Final Total: $${finalTotal.toFixed(2)}`);
    logAndCapture("===============================");

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
      logs: [],
    };
  }
}

function emptyChargeResult() {
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

// --- Student/Class/Discount Calculation Helpers ---
// (Keep your existing helpers here, unchanged for brevity.)
// fetchRelevantClassesForStudent, determineRelevantRatePlans, calculateRatePlanTuitionEnhanced, calculateRatePlanTuition, calculateRatePlanCost, getClassFees, getRelevantFees, calculateStudentDiscounts

// --- Export as Firebase Function ---
exports.chargesCalculator = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 60,
    invoker: "public",
  },
  app
);
