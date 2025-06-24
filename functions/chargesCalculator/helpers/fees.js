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

function getClassFees(classDoc) {
  // Initialize return object with a single class fee total
  const feeResult = {
    classFeeTotal: 0,
  };
  // Extract fees from Fee array if present
  if (classDoc.Fee && Array.isArray(classDoc.Fee) && classDoc.Fee.length > 0) {
    classDoc.Fee.forEach((fee) => {
      const amount = fee.FeeAmount || 0;
      feeResult.classFeeTotal += amount;
    });
  }
  return feeResult;
}

function getRelevantFees(student, classes, allFees) {
  // Initialize fee categories
  const feesByCategory = {
    registrationFees: [],
    costumeFees: [],
    otherFees: [],
  };
  if (!allFees || !Array.isArray(allFees) || allFees.length === 0) {
    return feesByCategory;
  }
  // Get all class IDs and season IDs for this student
  const classIds = classes.map((cls) => cls.id);
  const seasonIds = classes.map((cls) => cls.SeasonId).filter((id) => id);
  // Filter fees that are relevant to this student
  const relevantFees = allFees.filter((fee) => {
    switch (fee.AssociationType) {
      case "Student":
        return fee.AssociationItemId === student.id;
      case "Family":
        return fee.AssociationItemId === student.FamilyId;
      case "Class":
        return classIds.includes(fee.AssociationItemId);
      case "Season":
        return seasonIds.includes(fee.AssociationItemId);
      case "Global":
        return true;
      default:
        return false;
    }
  });
  // Categorize the fees based on their name
  relevantFees.forEach((fee) => {
    const feeName = fee.Name ? fee.Name.toLowerCase() : "";
    const feeAmount = parseFloat(fee.Amount) || 0;
    if (feeName.includes("registr") || feeName.includes("regist")) {
      feesByCategory.registrationFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
    } else if (feeName.includes("costume")) {
      feesByCategory.costumeFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
    } else {
      feesByCategory.otherFees.push({
        id: fee.id,
        name: fee.Name,
        amount: feeAmount,
        type: fee.FeeType,
      });
    }
  });
  return feesByCategory;
}

module.exports = {
  processFamilyFees,
  getClassFees,
  getRelevantFees,
};
