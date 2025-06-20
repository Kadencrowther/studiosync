const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

async function processAutoPay(familyData, apiKey, merchantCode, studioId) {
    try {
        const customerId = familyData.PayarcCustomerId;
        if (!customerId) {
            console.error("No PayArc customer ID found for family:", familyData.FamilyId);
            return;
        }

        const chargeResponse = await axios.post(
            "https://testapi.payarc.net/v1/charge", 
            {
                amount: familyData.Balance,
                customer_id: customerId,
                test_mode: true
            }, 
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "Merchant-Code": merchantCode
                }
            }
        );

        console.log(
            `Payment processed for ${familyData.FirstName} ${familyData.LastName}:`, 
            chargeResponse.data
        );

        await createPaymentDocument(
            studioId, 
            familyData.FamilyId, 
            familyData.Balance, 
            chargeResponse.data, 
            familyData.CardDetails[0]
        );
    } catch (error) {
        console.error("Error processing payment:", error);
    }
}

async function createPaymentDocument(studioId, familyId, amount, chargeData, cardDetails) {
    const db = admin.firestore();
    const paymentData = {
        Amount: amount,
        CreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        Description: `Payment from ${chargeData.customer.first_name} ${chargeData.customer.last_name}`,
        FamilyId: familyId,
        PaymentDate: admin.firestore.FieldValue.serverTimestamp(),
        PaymentMethod: {
            CardType: cardDetails.CardType,
            LastFour: cardDetails.CardNumber.slice(-4),
            Type: "Credit Card"
        },
        Status: "Paid",
        Type: "Payment"
    };

    const surchargeSettings = await db.collection("Studios")
        .doc(studioId)
        .collection("Surcharge")
        .doc("SurchargeSettings")
        .get();
        
    if (surchargeSettings.exists && surchargeSettings.data().IsActive) {
        const surchargeValue = surchargeSettings.data().Value;
        const surchargeName = surchargeSettings.data().Name || "Surcharge";
        const surchargeAmount = (amount * surchargeValue) / 100;
        paymentData.LineItems = [{
            Type: "Surcharge",
            Description: surchargeName,
            Amount: surchargeAmount
        }];
    }

    await db.collection(`Studios/${studioId}/Families/${familyId}/Payments`).add(paymentData);
    await db.collection(`Studios/${studioId}/Payments`).add(paymentData);

    console.log(`Payment document created for family: ${familyId}`);
}

// eslint-disable-next-line max-len
module.exports.handleAutoPayAndRegistrationPayments = onRequest({
  region: "us-central1",
  memory: "256MiB",
  minInstances: 0,
  maxInstances: 10
}, async (req, res) => {
    const today = new Date();
    const dayOfMonth = today.getDate();

    const studiosSnapshot = await admin.firestore().collection("Studios").get();

    for (const studioDoc of studiosSnapshot.docs) {
        const studioData = studioDoc.data();
        const billingDay = studioData.PaymentProcessing.Settings.General.AutoPayBillingDay;
        const apiKey = studioData.PaymentProcessing.Settings.Payarc.ApiKey;
        const merchantCode = studioData.PaymentProcessing.Settings.Payarc.MerchantId;

        if (dayOfMonth === billingDay) {
            const familiesSnapshot = await studioDoc.ref.collection("Families")
                .where("IsOnAutoPay", "==", true)
                .get();

            for (const familyDoc of familiesSnapshot.docs) {
                const familyData = familyDoc.data();
                await processAutoPay(familyData, apiKey, merchantCode, studioDoc.id);
            }
        }
    }

    console.log("Auto payments processed for applicable families.");
    res.send("Auto payments processed.");
});