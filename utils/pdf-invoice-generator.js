const PDFDocument = require('pdfkit');
const companyConfig = require('../config/company-config');

class InvoiceGenerator {
  constructor() {
    this.doc = null;
    this.currentY = 0;
  }

  // Generate PDF invoice for an order
  async generateInvoice(order, user) {
    return new Promise((resolve, reject) => {
      try {
        // Create new PDF document
        this.doc = new PDFDocument({ 
          size: 'A4', 
          margin: 50,
          info: {
            Title: `Invoice ${order.orderId}`,
            Author: companyConfig.name,
            Subject: `Invoice for Order ${order.orderId}`,
            Creator: companyConfig.name
          }
        });

        // Collect PDF data
        const chunks = [];
        this.doc.on('data', chunk => chunks.push(chunk));
        this.doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve(pdfBuffer);
        });
        this.doc.on('error', reject);

        // Generate invoice content
        this.addHeader();
        this.addCompanyInfo();
        this.addInvoiceInfo(order);
        this.addBillingInfo(user, order);
        this.addItemsTable(order);
        this.addSummary(order);
        this.addFooter();

        // Finalize the PDF
        this.doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  // Add header with company name
  addHeader() {
    this.currentY = 50;
    
    // Company name
    this.doc
      .fontSize(28)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(companyConfig.name, 50, this.currentY);
    
    this.currentY += 35;
    
    // Tagline
    this.doc
      .fontSize(12)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text(companyConfig.tagline, 50, this.currentY);
    
    this.currentY += 30;
    
    // Add horizontal line
    this.doc
      .strokeColor(companyConfig.colors.secondary)
      .lineWidth(1)
      .moveTo(50, this.currentY)
      .lineTo(545, this.currentY)
      .stroke();
    
    this.currentY += 20;
  }

  // Add company information
  addCompanyInfo() {
    const startY = this.currentY;
    
    // Company address
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text('From:', 50, this.currentY);
    
    this.currentY += 15;
    
    this.doc
      .fontSize(11)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(companyConfig.name, 50, this.currentY);
    
    this.currentY += 12;
    
    this.doc
      .fontSize(9)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text(companyConfig.address.line1, 50, this.currentY);
    
    this.currentY += 10;
    
    this.doc.text(companyConfig.address.line2, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(`${companyConfig.address.city}, ${companyConfig.address.state} ${companyConfig.address.pincode}`, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(companyConfig.address.country, 50, this.currentY);
    this.currentY += 15;
    
    this.doc.text(`Phone: ${companyConfig.contact.phone}`, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(`Email: ${companyConfig.contact.email}`, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(`Website: ${companyConfig.contact.website}`, 50, this.currentY);
    
    this.currentY = Math.max(this.currentY + 20, startY + 120);
  }

  // Add invoice information
  addInvoiceInfo(order) {
    const rightX = 350;
    const startY = 120;
    
    // Invoice title
    this.doc
      .fontSize(20)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text('INVOICE', rightX, startY);
    
    // Invoice details
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text('Invoice Number:', rightX, startY + 35)
      .text('Order ID:', rightX, startY + 50)
      .text('Invoice Date:', rightX, startY + 65)
      .text('Payment Method:', rightX, startY + 80);
    
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(`${companyConfig.invoice.prefix}-${order.orderId}`, rightX + 80, startY + 35)
      .text(order.orderId, rightX + 80, startY + 50)
      .text(new Date(order.invoiceDate).toLocaleDateString('en-IN'), rightX + 80, startY + 65)
      .text(order.paymentMethod, rightX + 80, startY + 80);
    
    this.currentY = Math.max(this.currentY, startY + 110);
  }

  // Add billing information
  addBillingInfo(user, order) {
    this.currentY += 20;
    
    // Billing to section
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text('Bill To:', 50, this.currentY);
    
    this.currentY += 15;
    
    this.doc
      .fontSize(11)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(order.shippingAddress.name, 50, this.currentY);
    
    this.currentY += 12;
    
    this.doc
      .fontSize(9)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text(order.shippingAddress.landMark, 50, this.currentY);
    
    this.currentY += 10;
    
    this.doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(`Phone: ${order.shippingAddress.phone}`, 50, this.currentY);
    this.currentY += 10;
    
    this.doc.text(`Email: ${user.email}`, 50, this.currentY);
    
    this.currentY += 30;
  }

  // Add items table
  addItemsTable(order) {
    const tableTop = this.currentY;
    const itemCodeX = 50;
    const descriptionX = 150;
    const quantityX = 350;
    const priceX = 400;
    const totalX = 480;
    
    // Table header
    this.doc
      .fontSize(10)
      .fillColor('#ffffff')
      .rect(50, tableTop, 495, 25)
      .fill(companyConfig.colors.primary);
    
    this.doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text('Item', itemCodeX + 5, tableTop + 8)
      .text('Description', descriptionX + 5, tableTop + 8)
      .text('Qty', quantityX + 5, tableTop + 8)
      .text('Price', priceX + 5, tableTop + 8)
      .text('Total', totalX + 5, tableTop + 8);
    
    this.currentY = tableTop + 25;
    
    // Table rows
    order.orderedItems.forEach((item, index) => {
      const rowY = this.currentY;
      const rowHeight = 30;
      
      // Alternate row background
      if (index % 2 === 0) {
        this.doc
          .rect(50, rowY, 495, rowHeight)
          .fill(companyConfig.colors.accent);
      }
      
      this.doc
        .fontSize(9)
        .fillColor(companyConfig.colors.primary)
        .font('Helvetica')
        .text(item.product.productName.substring(0, 15) + '...', itemCodeX + 5, rowY + 8)
        .text(`${item.product.brand} - ${item.product.productName.substring(0, 20)}...`, descriptionX + 5, rowY + 8)
        .text(item.quantity.toString(), quantityX + 5, rowY + 8)
        .text(`₹${item.price.toFixed(2)}`, priceX + 5, rowY + 8)
        .text(`₹${item.totalPrice.toFixed(2)}`, totalX + 5, rowY + 8);
      
      this.currentY += rowHeight;
    });
    
    // Table border
    this.doc
      .strokeColor(companyConfig.colors.secondary)
      .lineWidth(1)
      .rect(50, tableTop, 495, this.currentY - tableTop)
      .stroke();
    
    this.currentY += 20;
  }

  // Add summary section
  addSummary(order) {
    const summaryX = 350;
    
    // Summary box
    this.doc
      .strokeColor(companyConfig.colors.secondary)
      .lineWidth(1)
      .rect(summaryX, this.currentY, 195, 100)
      .stroke();
    
    // Summary content
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.secondary)
      .font('Helvetica')
      .text('Subtotal:', summaryX + 10, this.currentY + 15)
      .text('Discount:', summaryX + 10, this.currentY + 30)
      .text('Shipping:', summaryX + 10, this.currentY + 45);
    
    this.doc
      .fontSize(12)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text('Total:', summaryX + 10, this.currentY + 70);
    
    // Summary values
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica')
      .text(`₹${order.totalPrice.toFixed(2)}`, summaryX + 120, this.currentY + 15)
      .text(`-₹${order.discount.toFixed(2)}`, summaryX + 120, this.currentY + 30)
      .text(order.shippingCharges === 0 ? 'FREE' : `₹${order.shippingCharges.toFixed(2)}`, summaryX + 120, this.currentY + 45);
    
    this.doc
      .fontSize(12)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(`₹${order.finalAmount.toFixed(2)}`, summaryX + 120, this.currentY + 70);
    
    this.currentY += 120;
  }

  // Add footer
  addFooter() {
    this.currentY += 30;
    
    // Terms and conditions
    this.doc
      .fontSize(10)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text('Terms & Conditions:', 50, this.currentY);
    
    this.currentY += 15;
    
    companyConfig.invoice.terms.forEach(term => {
      this.doc
        .fontSize(8)
        .fillColor(companyConfig.colors.secondary)
        .font('Helvetica')
        .text(`• ${term}`, 50, this.currentY);
      this.currentY += 12;
    });
    
    this.currentY += 20;
    
    // Footer message
    this.doc
      .fontSize(12)
      .fillColor(companyConfig.colors.primary)
      .font('Helvetica-Bold')
      .text(companyConfig.invoice.footer, 50, this.currentY, { align: 'center', width: 495 });
  }
}

module.exports = InvoiceGenerator;
