const axios = require("axios");
const { getPayarcConfig } = require("../utils/payarc-config");

exports.createCustomer = async (data) => {
  try {
    const config = getPayarcConfig();
    
    // Format customer data according to PayArc API specs
    const customerData = {
      // Required field
      email: data.email,
      
      // Optional fields with proper formatting
      name: data.name,  // Full name, max 50 chars
      description: data.description || "Studio Sync Customer",
      send_email_address: data.email,  // Use same email for invoices
      country: data.country || "US",
      address_1: data.address_1,
      address_2: data.address_2,
      city: data.city,
      state: data.state,
      zip: parseInt(data.zip),  // Convert to integer
      phone: data.phone ? parseInt(data.phone.replace(/\D/g, "")) : undefined
    };

    const response = await axios.post(
      `${config.baseURL}/v1/customers`,
      customerData,
      {
        headers: {
          ...config.headers,
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error creating PayArc customer:", 
      error.response ? error.response.data : error.message,
      "Sent data:", data
    );
    throw error;
  }
};
