function calculateStudentDiscounts(
  student,
  classes,
  allDiscounts,
  promoCodes = []
) {
  if (
    !classes ||
    classes.length === 0 ||
    !allDiscounts ||
    !Array.isArray(allDiscounts)
  ) {
    return { discounts: [], total: 0 };
  }

  let totalDiscount = 0;
  const appliedDiscounts = [];

  // Get all class IDs and season IDs
  const classIds = classes.map((cls) => cls.id);
  const seasonIds = classes.map((cls) => cls.SeasonId).filter((id) => id);

  // Get promo codes from student and family
  const studentPromoCodes = student.PromoCodes || [];
  const familyPromoCodes = student.FamilyPromoCodes || [];
  const allPromoCodes = [
    ...studentPromoCodes,
    ...familyPromoCodes,
    ...(promoCodes || []),
  ];

  // Process class-specific discounts
  classes.forEach((classObj) => {
    // Find discounts for this class
    const classDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Class" &&
        discount.AssociationItemId === classObj.id
    );

    // Find discounts for this class's season
    const seasonDiscounts = classObj.SeasonId
      ? allDiscounts.filter(
          (discount) =>
            discount.IsActive &&
            discount.AssociationType === "Season" &&
            discount.AssociationItemId === classObj.SeasonId
        )
      : [];

    // Calculate class tuition for percentage discounts
    const classTuition = classObj.Tuition || 0;

    // Apply class discounts
    classDiscounts.forEach((discount) => {
      let discountAmount = 0;
      if (discount.DiscountType === "Percentage") {
        discountAmount = (classTuition * discount.Amount) / 100;
      } else {
        discountAmount = parseFloat(discount.Amount) || 0;
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
      } else {
        discountAmount = parseFloat(discount.Amount) || 0;
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

  // Calculate total tuition for percentage discounts
  const totalTuition = classes.reduce(
    (sum, cls) => sum + (cls.Tuition || 0),
    0
  );

  studentDiscounts.forEach((discount) => {
    let discountAmount = 0;
    if (discount.DiscountType === "Percentage") {
      discountAmount = (totalTuition * discount.Amount) / 100;
    } else {
      discountAmount = parseFloat(discount.Amount) || 0;
    }
    totalDiscount += discountAmount;
    appliedDiscounts.push({
      name: discount.Name,
      type: "Student",
      amount: discountAmount,
    });
  });

  // Apply promo code discounts
  if (allPromoCodes.length > 0) {
    const codeDiscounts = allDiscounts.filter(
      (discount) =>
        discount.IsActive &&
        discount.AssociationType === "Code" &&
        allPromoCodes.some(
          (code) => code.toUpperCase() === discount.DiscountCode?.toUpperCase()
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
      appliedDiscounts.push({
        name: discount.Name,
        type: "PromoCode",
        code: discount.DiscountCode,
        amount: discountAmount,
      });
    });
  }

  return { discounts: appliedDiscounts, total: totalDiscount };
}

module.exports = {
  calculateStudentDiscounts,
};
