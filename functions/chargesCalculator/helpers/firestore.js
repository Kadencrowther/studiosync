const admin = require("firebase-admin");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) admin.initializeApp();
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

  const fees = feesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

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

module.exports = {
  fetchStudioData,
  fetchFamilyDocument,
  fetchStudentsForFamily,
  fetchClassDetails,
  fetchRatePlans,
  fetchDiscounts,
  fetchFees,
  fetchStudentFamilyMax,
  fetchFamilyFees,
};
