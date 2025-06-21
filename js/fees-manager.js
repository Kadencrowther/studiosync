// Fees Manager - Handles all fee-related operations across the studio
const FeesManager = {
    /**
     * Add a fee to relevant families based on association type
     * @param {string} studioId - The studio ID
     * @param {object} fee - The fee object to add
     * @param {string} associationType - 'Season', 'Class', 'Family', or 'Student'
     * @param {string} associationId - ID of the associated entity
     */
    addFeeToFamilies: async (studioId, fee, associationType, associationId) => {
        const db = firebase.firestore();
        
        try {
            let families = [];
            
            // Get relevant families based on association type
            switch (associationType) {
                case 'Season':
                    families = await FeesManager.getFamiliesForSeason(studioId, associationId);
                    break;
                case 'Class':
                    families = await FeesManager.getFamiliesForClass(studioId, associationId);
                    break;
                case 'Family':
                    families = [{ familyId: associationId }];
                    break;
                case 'Student':
                    families = await FeesManager.getFamilyForStudent(studioId, associationId);
                    break;
                default:
                    throw new Error('Invalid association type');
            }
            
            // Add fee to each family
            for (const family of families) {
                await FeesManager.addFeeToFamily(studioId, family.familyId, fee, associationType, associationId);
            }
            
            return true;
        } catch (error) {
            console.error('Error in addFeeToFamilies:', error);
            throw error;
        }
    },

    /**
     * Add a fee to a specific family
     * @param {string} studioId - The studio ID
     * @param {string} familyId - The family ID
     * @param {object} fee - The fee object
     * @param {string} associationType - The type of association
     * @param {string} associationId - The ID of the associated entity
     */
    addFeeToFamily: async (studioId, familyId, fee, associationType, associationId) => {
        const db = firebase.firestore();
        const startDate = new Date();
        
        try {
            // Create the fee document for the family
            const feeDoc = {
                Name: fee.Name,
                Amount: parseFloat(fee.Amount),
                Type: fee.Type || "OneTime",
                IsRecurring: fee.Type === "Recurring",
                CreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                LastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                FeeId: fee.id, // Reference to original fee
                AssociationType: associationType,
                AssociationId: associationId,
                IsActive: true,
                HasEndDate: fee.HasEndDate || false,
                FeeEndDate: fee.HasEndDate ? fee.FeeEndDate : null
            };

            // Create payment schedule
            const schedule = [];
            
            if (fee.Type === "Recurring") {
                let monthsToSchedule = fee.Duration || 12;
                const monthlyAmount = fee.Amount / (fee.BrokenUpCount || 1);
                
                // Adjust months if there's an end date
                if (fee.HasEndDate && fee.FeeEndDate) {
                    const endDate = new Date(fee.FeeEndDate);
                    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                     (endDate.getMonth() - startDate.getMonth());
                    monthsToSchedule = Math.min(monthsToSchedule, Math.max(1, monthsDiff + 1));
                }
                
                feeDoc.EntireFeeAmount = monthlyAmount * monthsToSchedule;
                feeDoc.Duration = monthsToSchedule;

                for (let i = 0; i < monthsToSchedule; i++) {
                    const scheduleDate = new Date(startDate);
                    scheduleDate.setMonth(startDate.getMonth() + i);
                    
                    if (fee.HasEndDate && fee.FeeEndDate && scheduleDate > new Date(fee.FeeEndDate)) {
                        break;
                    }
                    
                    schedule.push({
                        Month: scheduleDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
                        Amount: monthlyAmount,
                        DueDate: scheduleDate.toISOString(),
                        Status: 'Unpaid'
                    });
                }
            } else {
                // One-time fee
                feeDoc.EntireFeeAmount = fee.Amount;
                schedule.push({
                    Month: startDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
                    Amount: fee.Amount,
                    DueDate: startDate.toISOString(),
                    Status: 'Unpaid'
                });
            }

            feeDoc.Schedule = schedule;
            
            // Add to family's Fees subcollection
            await db.collection('Studios')
                .doc(studioId)
                .collection('Families')
                .doc(familyId)
                .collection('Fees')
                .add(feeDoc);
                
        } catch (error) {
            console.error('Error adding fee to family:', error);
            throw error;
        }
    },

    /**
     * Update fee activation status across all families
     * @param {string} studioId - The studio ID
     * @param {string} feeId - The fee ID
     * @param {boolean} isActive - Whether to activate or deactivate
     */
    updateFeeActivation: async (studioId, feeId, isActive) => {
        const db = firebase.firestore();
        
        try {
            // First update the main fee
            await db.collection('Studios')
                .doc(studioId)
                .collection('Fees')
                .doc(feeId)
                .update({
                    IsActive: isActive,
                    LastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });

            // Get all families
            const familiesSnapshot = await db.collection('Studios')
                .doc(studioId)
                .collection('Families')
                .get();

            // Update fee status in each family
            for (const familyDoc of familiesSnapshot.docs) {
                const feesSnapshot = await familyDoc.ref
                    .collection('Fees')
                    .where('FeeId', '==', feeId)
                    .get();

                for (const feeDoc of feesSnapshot.docs) {
                    await feeDoc.ref.update({
                        IsActive: isActive,
                        LastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error updating fee activation:', error);
            throw error;
        }
    },

    /**
     * Delete a fee and remove it from all families
     * @param {string} studioId - The studio ID
     * @param {string} feeId - The fee ID to delete
     */
    deleteFee: async (studioId, feeId) => {
        const db = firebase.firestore();
        
        try {
            // First delete the main fee
            await db.collection('Studios')
                .doc(studioId)
                .collection('Fees')
                .doc(feeId)
                .delete();

            // Get all families
            const familiesSnapshot = await db.collection('Studios')
                .doc(studioId)
                .collection('Families')
                .get();

            // Delete fee from each family's Fees subcollection
            const deletionPromises = [];
            
            for (const familyDoc of familiesSnapshot.docs) {
                const feesSnapshot = await familyDoc.ref
                    .collection('Fees')
                    .where('FeeId', '==', feeId)
                    .get();

                feesSnapshot.docs.forEach(feeDoc => {
                    const feeData = feeDoc.data();
                    if (feeData.Schedule) {
                        const hasPaidPayments = feeData.Schedule.some(payment => payment.Status === 'Paid');
                        if (!hasPaidPayments) {
                            deletionPromises.push(feeDoc.ref.delete());
                        } else {
                            deletionPromises.push(feeDoc.ref.update({
                                IsActive: false,
                                IsDeleted: true,
                                DeletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                                LastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                            }));
                        }
                    } else {
                        deletionPromises.push(feeDoc.ref.delete());
                    }
                });
            }

            // Wait for all deletions to complete
            await Promise.all(deletionPromises);
            
            return true;
        } catch (error) {
            console.error('Error deleting fee:', error);
            throw error;
        }
    },

    /**
     * Get all families that have students in a specific season
     * @param {string} studioId - The studio ID
     * @param {string} seasonId - The season ID
     */
    getFamiliesForSeason: async (studioId, seasonId) => {
        const db = firebase.firestore();
        const families = new Set();
        
        try {
            // Get all classes in the season
            const classesSnapshot = await db.collection('Studios')
                .doc(studioId)
                .collection('Classes')
                .where('SeasonId', '==', seasonId)
                .get();

            // Get all students in these classes
            for (const classDoc of classesSnapshot.docs) {
                const studentsSnapshot = await db.collection('Studios')
                    .doc(studioId)
                    .collection('Students')
                    .where('Classes', 'array-contains', classDoc.id)
                    .get();

                // Add their families to the set
                studentsSnapshot.docs.forEach(studentDoc => {
                    if (studentDoc.data().FamilyId) {
                        families.add({ familyId: studentDoc.data().FamilyId });
                    }
                });
            }
            
            return Array.from(families);
        } catch (error) {
            console.error('Error getting families for season:', error);
            throw error;
        }
    },

    /**
     * Get all families that have students in a specific class
     * @param {string} studioId - The studio ID
     * @param {string} classId - The class ID
     */
    getFamiliesForClass: async (studioId, classId) => {
        const db = firebase.firestore();
        const families = new Set();
        
        try {
            // Get all students in the class
            const studentsSnapshot = await db.collection('Studios')
                .doc(studioId)
                .collection('Students')
                .where('Classes', 'array-contains', classId)
                .get();

            // Add their families to the set
            studentsSnapshot.docs.forEach(studentDoc => {
                if (studentDoc.data().FamilyId) {
                    families.add({ familyId: studentDoc.data().FamilyId });
                }
            });
            
            return Array.from(families);
        } catch (error) {
            console.error('Error getting families for class:', error);
            throw error;
        }
    },

    /**
     * Get the family for a specific student
     * @param {string} studioId - The studio ID
     * @param {string} studentId - The student ID
     */
    getFamilyForStudent: async (studioId, studentId) => {
        const db = firebase.firestore();
        
        try {
            const studentDoc = await db.collection('Studios')
                .doc(studioId)
                .collection('Students')
                .doc(studentId)
                .get();

            if (!studentDoc.exists || !studentDoc.data().FamilyId) {
                throw new Error('Student not found or no family associated');
            }

            return [{ familyId: studentDoc.data().FamilyId }];
        } catch (error) {
            console.error('Error getting family for student:', error);
            throw error;
        }
    }
};