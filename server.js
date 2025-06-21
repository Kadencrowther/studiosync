require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Payarc API endpoints
const PAYARC_BASE_URL = process.env.PAYARC_BASE_URL;
const PAYARC_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.PAYARC_KEY}`,
    'Payarc-Version': process.env.PAYARC_VERSION,
    'Merchant-Code': process.env.PAYARC_MERCHANT_CODE
};

// Create customer endpoint
app.post('/api/create-customer', async (req, res) => {
    try {
        const response = await axios.post(
            `${PAYARC_BASE_URL}/customers`,
            req.body,
            { headers: PAYARC_HEADERS }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create token endpoint
app.post('/api/create-token', async (req, res) => {
    try {
        const response = await axios.post(
            `${PAYARC_BASE_URL}/tokens`,
            req.body,
            { headers: PAYARC_HEADERS }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create subscription endpoint
app.post('/api/create-subscription', async (req, res) => {
    try {
        const response = await axios.post(
            `${PAYARC_BASE_URL}/subscriptions`,
            req.body,
            { headers: PAYARC_HEADERS }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 