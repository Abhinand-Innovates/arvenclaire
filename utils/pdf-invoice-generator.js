const PDFDocument = require('pdfkit');
const companyConfig = require('../config/company-config');

class InvoiceGenerator {
  constructor() {
    this.doc = null;
    this.currentY = 0;
    this.pageWidth = 595.28; // A4 width in points
    this.pageHeight = 841.89; // A4 height in points
    this.margin = 50;
    this.contentWidth = this.pageWidth - (this.margin * 2);
  }

  // Generate PDF invoice for an order
  async generateInvoice(order, user) {
    return new Promise((resolve, reject) => {
      try {
        // Create new PDF document
        this.doc = new PDFDocument({ 
          size: 'A4', 
          margin: this.margin,
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

  // Add simple header
  addHeader() {
    this.currentY = this.margin;
    
    // Company name and Invoice title on same line
    this.doc
      .fontSize(16)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(companyConfig.name, this.margin, this.currentY);
    
    this.doc
      .fontSize(14)
      .fillColor('#000000')
      .font('Helvetica-Bold');
    
    // Tagline on second line
    this.doc
      .fontSize(8)
      .fillColor('#666666')
      .font('Helvetica')
      .text(companyConfig.tagline, this.margin, this.currentY + 20);
    
    // Horizontal line
    this.currentY += 40;
    this.doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(this.margin, this.currentY)
      .lineTo(this.pageWidth - this.margin, this.currentY)
      .stroke();
    
    this.currentY += 20;
  }

  // Add invoice information
  addInvoiceInfo(order) {
    // Create a bordered box for invoice details
    const boxWidth = 200;
    const boxHeight = 80;
    const boxX = this.pageWidth - this.margin - boxWidth;
    
    this.doc
      .rect(boxX, this.currentY, boxWidth, boxHeight)
      .stroke('#cccccc');
    
    // Invoice details in a neat grid
    const labelX = boxX + 10;
    const valueX = boxX + 90;
    let detailY = this.currentY + 12;
    
    const details = [
      { label: 'Invoice No:', value: `${companyConfig.invoice.prefix}-${order.orderId}` },
      { label: 'Order ID:', value: order.orderId },
      { label: 'Date:', value: new Date(order.invoiceDate || order.createdAt).toLocaleDateString('en-IN') },
      { label: 'Payment:', value: order.paymentMethod }
    ];
    
    details.forEach(detail => {
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(detail.label, labelX, detailY);
      
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text(detail.value, valueX, detailY);
      
      detailY += 16;
    });
    
    this.currentY += boxHeight + 20;
  }

  // Add billing information
  addBillingInfo(user, order) {
    const leftWidth = (this.contentWidth - 40) / 2;
    
    // Company info
    this.doc
      .fontSize(10)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('From:', this.margin, this.currentY);
    
    this.currentY += 15;
    
    this.doc
      .fontSize(9)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(companyConfig.name, this.margin, this.currentY);
    
    this.currentY += 12;
    
    const companyInfo = [
      companyConfig.address.line1,
      companyConfig.address.line2,
      `${companyConfig.address.city}, ${companyConfig.address.state} ${companyConfig.address.pincode}`,
      companyConfig.contact.phone,
      companyConfig.contact.email
    ];
    
    companyInfo.forEach(line => {
      this.doc
        .fontSize(8)
        .fillColor('#333333')
        .font('Helvetica')
        .text(line, this.margin, this.currentY);
      this.currentY += 10;
    });
    
    // Customer info
    const customerX = this.margin + leftWidth + 40;
    let customerY = this.currentY - (companyInfo.length * 10) - 27;
    
    this.doc
      .fontSize(10)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('Bill To:', customerX, customerY);
    
    customerY += 15;
    
    this.doc
      .fontSize(9)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(order.shippingAddress.name, customerX, customerY);
    
    customerY += 12;
    
    const customerInfo = [
      order.shippingAddress.landMark,
      `${order.shippingAddress.city}, ${order.shippingAddress.state}`,
      `PIN: ${order.shippingAddress.pincode}`,
      order.shippingAddress.phone,
      user.email
    ];
    
    customerInfo.forEach(line => {
      this.doc
        .fontSize(8)
        .fillColor('#333333')
        .font('Helvetica')
        .text(line, customerX, customerY);
      customerY += 10;
    });
    
    this.currentY += 30;
  }

  // Add items table
  addItemsTable(order) {
    const tableTop = this.currentY;
    const rowHeight = 25;
    const headerHeight = 30;
    
    // Table header
    this.doc
      .rect(this.margin, tableTop, this.contentWidth, headerHeight)
      .fill('#f5f5f5')
      .stroke('#cccccc');
    
    // Column headers
    this.doc
      .fontSize(8)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('Product', this.margin + 10, tableTop + 10)
      .text('Qty', this.margin + 250, tableTop + 10)
      .text('Price', this.margin + 300, tableTop + 10)
      .text('Total', this.margin + 370, tableTop + 10)
      .text('Status', this.margin + 440, tableTop + 10);
    
    this.currentY = tableTop + headerHeight;
    
    // Add items
    order.orderedItems.forEach((item, index) => {
      const rowY = this.currentY;
      
      // Row border
      this.doc
        .rect(this.margin, rowY, this.contentWidth, rowHeight)
        .stroke('#e0e0e0');
      
      // Alternate row background
      if (index % 2 === 1) {
        this.doc
          .rect(this.margin, rowY, this.contentWidth, rowHeight)
          .fill('#fafafa');
      }
      
      // Product name
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica')
        .text(this.truncateText(item.product.productName, 35), this.margin + 10, rowY + 8);
      
      // Quantity
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica')
        .text(item.quantity.toString(), this.margin + 250, rowY + 8);
      
      // Price
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`₹${item.price.toFixed(2)}`, this.margin + 300, rowY + 8);
      
      // Total
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text(`₹${item.totalPrice.toFixed(2)}`, this.margin + 370, rowY + 8);
      
      // Status
      this.doc
        .fontSize(7)
        .fillColor('#666666')
        .font('Helvetica')
        .text(item.status, this.margin + 440, rowY + 8);
      
      this.currentY += rowHeight;
    });
    
    // Table bottom border
    this.doc
      .rect(this.margin, tableTop, this.contentWidth, this.currentY - tableTop)
      .stroke('#cccccc');
    
    this.currentY += 20;
  }

  // Add summary section
  addSummary(order) {
    // Calculate totals using the same logic as order details page
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
    const cancelledItems = order.orderedItems.filter(item => item.status === 'Cancelled');
    const returnedItems = order.orderedItems.filter(item => item.status === 'Returned');
    
    const includedItems = [...activeItems, ...returnRequestItems];
    
    let amountAfterDiscount = 0;
    includedItems.forEach(item => {
      amountAfterDiscount += item.totalPrice;
    });
    
    let currentTotal = amountAfterDiscount;
    if (includedItems.length > 0) {
      currentTotal += order.shippingCharges;
    }
    
    const cancelledAmount = cancelledItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const returnedAmount = returnedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Summary section
    const summaryX = this.pageWidth - 200;
    
    // Subtotal
    this.doc
      .fontSize(8)
      .fillColor('#666666')
      .font('Helvetica')
      .text('Subtotal:', summaryX, this.currentY);
    
    this.doc
      .fontSize(8)
      .fillColor('#000000')
      .font('Helvetica')
      .text(`₹${amountAfterDiscount.toFixed(2)}`, summaryX + 100, this.currentY);
    
    this.currentY += 12;
    
    // Discount (if any)
    if (order.discount > 0) {
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text('Discount:', summaryX, this.currentY);
      
      this.doc
        .fontSize(8)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`-₹${order.discount.toFixed(2)}`, summaryX + 100, this.currentY);
      
      this.currentY += 12;
    }
    
    // Cancelled amount (if any)
    if (cancelledAmount > 0) {
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text('Cancelled:', summaryX, this.currentY);
      
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`-₹${cancelledAmount.toFixed(2)}`, summaryX + 100, this.currentY);
      
      this.currentY += 12;
    }
    
    // Returned amount (if any)
    if (returnedAmount > 0) {
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text('Returned:', summaryX, this.currentY);
      
      this.doc
        .fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`-₹${returnedAmount.toFixed(2)}`, summaryX + 100, this.currentY);
      
      this.currentY += 12;
    }
    
    // Shipping
    this.doc
      .fontSize(8)
      .fillColor('#666666')
      .font('Helvetica')
      .text('Shipping:', summaryX, this.currentY);
    
    this.doc
      .fontSize(8)
      .fillColor('#000000')
      .font('Helvetica')
      .text(order.shippingCharges === 0 ? 'FREE' : `₹${order.shippingCharges.toFixed(2)}`, summaryX + 100, this.currentY);
    
    this.currentY += 15;
    
    // Horizontal line
    this.doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(summaryX, this.currentY)
      .lineTo(this.pageWidth - this.margin, this.currentY)
      .stroke();
    
    this.currentY += 12;
    
    // Total
    this.doc
      .fontSize(10)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('Total:', summaryX, this.currentY);
    
    this.doc
      .fontSize(10)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(`₹${currentTotal.toFixed(2)}`, summaryX + 100, this.currentY);
    
    this.currentY += 40;
  }

  // Add footer
  addFooter() {
    // Terms and conditions
    this.doc
      .fontSize(9)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('Terms & Conditions:', this.margin, this.currentY);
    
    this.currentY += 12;
    
    companyConfig.invoice.terms.forEach(term => {
      this.doc
        .fontSize(7)
        .fillColor('#333333')
        .font('Helvetica')
        .text(`• ${term}`, this.margin, this.currentY, { width: this.contentWidth });
      this.currentY += 10;
    });
    
    this.currentY += 15;
    
    // Business information
    this.doc
      .fontSize(9)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('Business Information:', this.margin, this.currentY);
    
    this.currentY += 12;
    
    const businessInfo = [
      `GST Number: ${companyConfig.business.gst}`,
      `PAN Number: ${companyConfig.business.pan}`,
      `CIN Number: ${companyConfig.business.cin}`
    ];
    
    businessInfo.forEach(info => {
      this.doc
        .fontSize(7)
        .fillColor('#333333')
        .font('Helvetica')
        .text(info, this.margin, this.currentY);
      this.currentY += 10;
    });
    
    this.currentY += 20;
    
    // Footer message
    this.doc
      .fontSize(9)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(companyConfig.invoice.footer, this.margin, this.currentY, { 
        align: 'center', 
        width: this.contentWidth 
      });
    
    this.currentY += 15;
    
    // Contact information
    this.doc
      .fontSize(7)
      .fillColor('#666666')
      .font('Helvetica')
      .text(`${companyConfig.contact.email} | ${companyConfig.contact.phone} | ${companyConfig.contact.website}`, 
            this.margin, this.currentY, { 
              align: 'center', 
              width: this.contentWidth 
            });
  }

  // Helper method to truncate text
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = InvoiceGenerator;