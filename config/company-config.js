const companyConfig = {
  // Company Information
  name: "ARVENCLAIRE",
  tagline: "Premium Fashion & Lifestyle",
  
  // Contact Information
  address: {
    line1: "123 Fashion Street",
    line2: "Premium District",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India"
  },
  
  contact: {
    phone: "+91 98765 43210",
    email: "support@arvenclaire.com",
    website: "www.arvenclaire.com"
  },
  
  // Business Information
  business: {
    gst: "27AABCU9603R1ZX", // Sample GST number
    pan: "AABCU9603R",
    cin: "U74999MH2020PTC123456" // Sample CIN
  },
  
  // Invoice Settings
  invoice: {
    prefix: "INV",
    terms: [
      "All sales are final unless otherwise specified",
      "Returns accepted within 7 days of delivery",
      "Damaged items must be reported within 24 hours",
      "Free shipping on orders above ₹500"
    ],
    footer: "Thank you for shopping with ARVENCLAIRE!"
  },
  
  // Colors for PDF styling
  colors: {
    primary: "#000000",      // Black
    secondary: "#666666",    // Gray
    accent: "#f8f9fa",      // Light gray background
    success: "#28a745",     // Green for positive amounts
    danger: "#dc3545"       // Red for negative amounts
  }
};

module.exports = companyConfig;
