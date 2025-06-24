// Add this new function to apply StudentFamilyMax limits
function applyStudentFamilyMaxLimits(
  studentRatePlanTotals,
  familyRatePlanTotal,
  studentFamilyMax
) {
  console.log("StudentFamilyMax check: Starting limit verification");

  if (!studentFamilyMax) {
    console.log("StudentFamilyMax check: No limits configured, skipping");
    return {
      adjustedStudentTotals: studentRatePlanTotals,
      adjustedFamilyTotal: familyRatePlanTotal,
      reduction: 0,
    };
  }

  const studentMax = studentFamilyMax.StudentMax || 0;
  const familyMax = studentFamilyMax.FamilyMax || 0;

  console.log(
    `StudentFamilyMax check: Limits configured - Student: $${studentMax}, Family: $${familyMax}`
  );

  // Apply student-level max if configured
  const adjustedStudentTotals = {};
  let adjustedFamilyRatePlanTotal = 0;

  if (studentMax > 0) {
    console.log("Applying student-level maximums...");

    Object.entries(studentRatePlanTotals).forEach(([studentId, tuition]) => {
      if (tuition > studentMax) {
        console.log(
          `StudentFamilyMax check: Student ${studentId} tuition ($${tuition.toFixed(
            2
          )}) exceeds max ($${studentMax}), capping at max`
        );
        adjustedStudentTotals[studentId] = studentMax;
      } else {
        console.log(
          `StudentFamilyMax check: Student ${studentId} tuition ($${tuition.toFixed(
            2
          )}) is under max ($${studentMax})`
        );
        adjustedStudentTotals[studentId] = tuition;
      }
    });

    // Calculate adjusted family total after student caps
    adjustedFamilyRatePlanTotal = Object.values(adjustedStudentTotals).reduce(
      (sum, amount) => sum + amount,
      0
    );
    console.log(
      `StudentFamilyMax check: After student caps, family total is $${adjustedFamilyRatePlanTotal.toFixed(
        2
      )}`
    );
  } else {
    // No student max, just copy the original totals
    Object.entries(studentRatePlanTotals).forEach(([studentId, tuition]) => {
      adjustedStudentTotals[studentId] = tuition;
    });
    adjustedFamilyRatePlanTotal = familyRatePlanTotal;
  }

  // Apply family-level max if configured
  let finalFamilyRatePlanTotal = adjustedFamilyRatePlanTotal;

  if (familyMax > 0 && adjustedFamilyRatePlanTotal > familyMax) {
    console.log(
      `StudentFamilyMax check: Family total rate plan tuition ($${adjustedFamilyRatePlanTotal.toFixed(
        2
      )}) exceeds max ($${familyMax}), capping at max`
    );
    finalFamilyRatePlanTotal = familyMax;
  } else if (familyMax > 0) {
    console.log(
      `StudentFamilyMax check: Family total rate plan tuition ($${adjustedFamilyRatePlanTotal.toFixed(
        2
      )}) is under max ($${familyMax})`
    );
  }

  // Calculate total reduction from the caps
  const totalReduction = familyRatePlanTotal - finalFamilyRatePlanTotal;
  console.log(
    `StudentFamilyMax check: Total tuition reduction from caps: $${totalReduction.toFixed(
      2
    )}`
  );

  return {
    adjustedStudentTotals,
    adjustedFamilyTotal: finalFamilyRatePlanTotal,
    reduction: totalReduction,
  };
}
