const admin = require("firebase-admin");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) admin.initializeApp();

async function fetchStudioData(studioId, log) {
  /* ... */
}
async function fetchFamilyDocument(studioId, familyId, log) {
  /* ... */
}
async function fetchStudentsForFamily(studioId, familyId, log) {
  /* ... */
}
async function fetchClassDetails(studioId, classIds, log) {
  /* ... */
}
async function fetchRatePlans(studioId, log) {
  /* ... */
}
async function fetchDiscounts(studioId, log) {
  /* ... */
}
async function fetchFees(studioId, log) {
  /* ... */
}
async function fetchStudentFamilyMax(studioId, log) {
  /* ... */
}
async function fetchFamilyFees(studioId, familyId, log) {
  /* ... */
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
