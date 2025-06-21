const axios = require("axios");
const { getPayarcConfig } = require("../utils/payarc-config");

exports.createToken = async (data) => {
  try {
    const config = getPayarcConfig();
    const response = await axios.post(
      `${config.baseURL}/tokens`,
      {
        card_source: data.card_source,
        card_number: data.card_number,
        exp_month: data.exp_month,
        exp_year: data.exp_year,
        cvc: data.cvc,
        name: data.name,
        address_line1: data.address_line1,
        city: data.city,
        state_code: data.state_code,
        zip: data.zip,
        country_code: data.country_code,
        test_mode: data.test_mode,
        authorize_card: data.authorize_card
      },
      { headers: config.headers }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating token:", error.response && error.response.data || error.message);
    throw error;
  }
};

exports.attachSource = async (data) => {
  try {
    const config = getPayarcConfig();
    const response = await axios.post(
      `${config.baseURL}/customers/${data.customer_id}/sources`,
      { token_id: data.token_id },
      { headers: config.headers }
    );
    return response.data;
  } catch (error) {
    console.error("Error attaching source:", error.response && error.response.data || error.message);
    throw error;
  }
};
