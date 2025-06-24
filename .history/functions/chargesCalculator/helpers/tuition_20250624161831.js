const {
  fetchStudioData,
  fetchFamilyDocument,
  fetchStudentsForFamily,
  fetchClassDetails,
  fetchRatePlans,
  fetchDiscounts,
  fetchFees,
  fetchStudentFamilyMax,
  fetchFamilyFees,
} = require("./firestore");
const { processFamilyFees } = require("./fees");
const { calculateStudentDiscounts } = require("./discounts");

// Helper: fetch relevant classes for a student
async function fetchRelevantClassesForStudent(
  studioId,
  student,
  allClasses,
  log
) {
  if (
    !student.Classes ||
    !Array.isArray(student.Classes) ||
    student.Classes.length === 0
  ) {
    log(`Student has no classes assigned`);
    return [];
  }
  const relevantClasses = [];
  for (const classId of student.Classes) {
    const classData = allClasses.find((cls) => cls.id === classId);
    if (classData) relevantClasses.push(classData);
  }
  return relevantClasses;
}

// Helper: determine relevant rate plans for classes
function determineRelevantRatePlans(
  studentClasses,
  allRatePlans,
  defaultRatePlanId,
  log
) {
  const relevantRatePlans = new Map();
  for (const classData of studentClasses) {
    const ratePlanId = classData.RatePlanId || defaultRatePlanId;
    if (ratePlanId && allRatePlans[ratePlanId]) {
      if (!relevantRatePlans.has(ratePlanId)) {
        relevantRatePlans.set(ratePlanId, {
          ratePlan: allRatePlans[ratePlanId],
          classes: [classData],
          totalHours: classData.Duration ? classData.Duration / 60 : 1,
        });
      } else {
        const existingEntry = relevantRatePlans.get(ratePlanId);
        existingEntry.classes.push(classData);
        existingEntry.totalHours += classData.Duration
          ? classData.Duration / 60
          : 1;
      }
    }
  }
  return Object.fromEntries(relevantRatePlans);
}

// Helper: calculate tuition for a student
function calculateRatePlanTuitionEnhanced(
  student,
  studentClasses,
  allRatePlans,
  defaultRatePlanId,
  log = console.log
) {
  if (!studentClasses || studentClasses.length === 0) return 0;
  const classesForCalc = studentClasses.map((cls) => ({
    id: cls.id,
    name: cls.ClassName || "Unnamed Class",
    duration: cls.Duration || 60,
    ratePlanId: cls.RatePlanId || defaultRatePlanId,
  }));
  const classesByRatePlan = {};
  classesForCalc.forEach((cls) => {
    const ratePlanId = cls.ratePlanId;
    const hoursForClass = cls.duration / 60;
    if (!classesByRatePlan[ratePlanId]) {
      classesByRatePlan[ratePlanId] = { hours: 0, classes: [] };
    }
    classesByRatePlan[ratePlanId].hours += hoursForClass;
    classesByRatePlan[ratePlanId].classes.push(cls);
  });
  let totalTuition = 0;
  for (const [ratePlanId, data] of Object.entries(classesByRatePlan)) {
    const ratePlan = allRatePlans[ratePlanId];
    if (!ratePlan) continue;
    totalTuition += calculateRatePlanCost(data.hours, ratePlan);
  }
  return totalTuition;
}

// Helper: calculate cost based on hours and rate plan
function calculateRatePlanCost(hours, ratePlan) {
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
  if (!hasHourRates && !hasTiers) return 0;
  if (hasHourRates) {
    const sortedRates = [...ratePlan.HourRates].sort(
      (a, b) => a.Hours - b.Hours
    );
    const applicableRate = sortedRates.find((rate) => hours <= rate.Hours);
    if (applicableRate) return applicableRate.Rate;
    else if (sortedRates.length > 0)
      return sortedRates[sortedRates.length - 1].Rate;
  } else if (hasTiers) {
    const sortedTiers = [...ratePlan.Tiers].sort((a, b) => a.Hours - b.Hours);
    const applicableTier = sortedTiers.find((tier) => hours <= tier.Hours);
    if (applicableTier) return applicableTier.Cost;
    else if (sortedTiers.length > 0)
      return sortedTiers[sortedTiers.length - 1].Cost;
  }
  return 0;
}

async function calculateFamilyCharges(familyData, studioId, log = console.log) {
  try {
    let processedFees = [];
    let totalFees = 0;
    let totalTuition = 0;
    let totalDiscount = 0;
    let studentCharges = [];
    let familyDiscounts = [];
    const logs = [];
    const logAndCapture = (message) => {
      log(message);
      logs.push(message);
    };

    // Fetch all required data
    const studioData = await fetchStudioData(studioId, log);
    let studentFamilyMax = studioData.StudentFamilyMax || null;
    if (!studentFamilyMax) {
      studentFamilyMax = await fetchStudentFamilyMax(studioId, log);
    }
    let fullFamilyData = familyData;
    if (!familyData.FirstName && familyData.id) {
      const familyId = familyData.id || familyData.FamilyId;
      fullFamilyData = await fetchFamilyDocument(studioId, familyId, log);
    }
    const familyId = fullFamilyData.id || fullFamilyData.FamilyId;
    const students = await fetchStudentsForFamily(studioId, familyId, log);

    if (students.length === 0) {
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
    const classIds = new Set();
    students.forEach((student) => {
      if (student.Classes && Array.isArray(student.Classes)) {
        student.Classes.forEach((cls) => classIds.add(cls));
      }
    });

    if (classIds.size === 0) {
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

    // Get class details, rate plans, discounts, fees
    const classesData = await fetchClassDetails(studioId, classIds, log);
    const ratePlans = await fetchRatePlans(studioId, log);
    const allDiscounts = await fetchDiscounts(studioId, log);
    const allFees = await fetchFees(studioId, log);

    const familyRatePlan =
      fullFamilyData.RatePlan || studioData.DefaultRatePlan || "Monthly";
    const defaultRatePlanId =
      Object.values(ratePlans).find((rp) => rp.Name === familyRatePlan)?.id ||
      Object.keys(ratePlans)[0];

    // Calculate tuition for each student
    for (const student of students) {
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

      // Process class fees
      const familyFees = await fetchFamilyFees(studioId, familyId, log);
      processedFees = processFamilyFees(familyFees, new Date(), log);
      totalFees = processedFees.reduce((sum, fee) => sum + fee.amount, 0);

      // Calculate student discounts
      const familyPromoCodes = fullFamilyData.PromoCodes || [];
      const studentDiscountResult = calculateStudentDiscounts(
        student,
        studentClasses,
        allDiscounts,
        familyPromoCodes
      );
      const studentDiscountTotal = studentDiscountResult.total;

      // Add student to charges
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
    }

    // Apply family-level discounts
    const familySpecificDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Family" &&
        discount.AssociationItemId === familyData.id
    );
    familySpecificDiscounts.forEach((discount) => {
      let discountAmount = 0;
      if (discount.DiscountType === "Percentage") {
        discountAmount = (totalTuition * discount.Amount) / 100;
      } else {
        discountAmount = parseFloat(discount.Amount) || 0;
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
      Object.values(ratePlans).forEach((ratePlan) => {
        if (
          ratePlan.FamilyDiscount &&
          ratePlan.FamilyDiscount.StudentThreshold &&
          ratePlan.FamilyDiscount.Amount
        ) {
          const threshold = ratePlan.FamilyDiscount.StudentThreshold;
          const amount = ratePlan.FamilyDiscount.Amount;
          const type = ratePlan.FamilyDiscount.Type || "percentage";
          if (students.length >= threshold) {
            let discountAmount = 0;
            if (type === "percentage") {
              discountAmount = (totalTuition * amount) / 100;
            } else {
              discountAmount = parseFloat(amount) || 0;
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

    // Promo codes at the family level
    const familyPromoCodes = fullFamilyData.PromoCodes || [];
    if (familyPromoCodes.length > 0) {
      const codeDiscounts = allDiscounts.filter(
        (discount) =>
          discount.IsActive &&
          discount.AssociationType === "Code" &&
          familyPromoCodes.some(
            (code) =>
              code.toUpperCase() === discount.DiscountCode?.toUpperCase()
          )
      );
      codeDiscounts.forEach((discount) => {
        let discountAmount = 0;
        if (discount.DiscountType === "Percentage") {
          discountAmount = (totalTuition * discount.Amount) / 100;
        } else {
          discountAmount = parseFloat(discount.Amount) || 0;
        }
        totalDiscount += discountAmount;
        familyDiscounts.push({
          name: discount.Name,
          type: "FamilyPromoCode",
          code: discount.DiscountCode,
          amount: discountAmount,
        });
      });
    }

    // Add student-level discounts to total
    studentCharges.forEach((student) => {
      if (student.discountTotal > 0) {
        totalDiscount += student.discountTotal;
      }
    });

    const finalTotal = totalTuition + totalFees - totalDiscount;

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
    return {
      success: false,
      error: error.message || "An unexpected error occurred",
      logs: [],
    };
  }
}

module.exports = {
  calculateFamilyCharges,
};
