// Card number formatting
document.getElementById('cardNumber').addEventListener('input', function(e) {
    // Remove any non-digit characters
    let value = this.value.replace(/\D/g, '');
    
    // Add spaces after every 4 digits
    if (value.length > 0) {
        value = value.match(/.{1,4}/g).join(' ');
    }
    
    // Update the value
    this.value = value;
});

// Expiry date formatting (MM/YY)
document.getElementById('expiryDate').addEventListener('input', function(e) {
    // Remove non-digit characters
    let value = this.value.replace(/\D/g, '');
    
    // Add slash after first 2 digits
    if (value.length > 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    
    // Update the value
    this.value = value;
    
    // Validate month (01-12)
    if (value.length >= 2) {
        const month = parseInt(value.substring(0, 2));
        if (month < 1 || month > 12) {
            this.setCustomValidity('Month must be between 01 and 12');
        } else {
            this.setCustomValidity('');
        }
    }
});

// CVC formatting (limit to 3-4 digits)
document.getElementById('cvv').addEventListener('input', function(e) {
    // Remove non-digit characters
    let value = this.value.replace(/\D/g, '');
    
    // Limit to 3-4 digits
    if (value.length > 4) {
        value = value.substring(0, 4);
    }
    
    // Update the value
    this.value = value;
}); 