const axios = require("axios");
const { getPayarcConfig } = require("../utils/payarc-config");

exports.createSubscription = async (data) => {
  try {
    const config = getPayarcConfig();
    const response = await axios.post(
      `${config.baseURL}/subscriptions`,
      {
        customer_id: data.customer_id,
        plan_id: data.plan_id,
        trial_days: data.trial_days,
        billing_type: data.billing_type
      },
      { headers: config.headers }
    );

    return response.data;
  } catch (error) {
    console.error("Error creating subscription:", error.response && error.response.data || error.message);
    throw error;
  }
};
