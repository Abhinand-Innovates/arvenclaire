// Admin ledger management controller
const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const ledgerController = {
    getLedgerData: async (filters) => {
        const { 
            timePeriod = 'monthly', 
            paymentMethod = 'all', 
            orderStatus = 'all',
            startDate,
            endDate
        } = filters;

        const now = new Date();
        let startDateObj, endDateObj;
        
        if (startDate && endDate) {
            startDateObj = new Date(startDate);
            endDateObj = new Date(endDate);
            
            if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
                throw new Error('Invalid date format provided');
            }
            
            if (startDateObj > endDateObj) {
                throw new Error('Start date cannot be after end date');
            }
            
            startDateObj.setHours(0, 0, 0, 0);
            endDateObj.setHours(23, 59, 59, 999);
        } else {
            switch (timePeriod) {
                case 'weekly':
                    startDateObj = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'yearly':
                    startDateObj = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                case 'monthly':
                default:
                    startDateObj = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
            endDateObj = now;
        }

        const matchQuery = {
            createdAt: { $gte: startDateObj, $lte: endDateObj }
        };

        if (paymentMethod !== 'all') {
            if (paymentMethod === 'cod') {
                matchQuery.paymentMethod = 'Cash on Delivery';
            } else if (paymentMethod === 'online') {
                matchQuery.paymentMethod = 'Online Payment';
            } else if (paymentMethod === 'wallet') {
                matchQuery.paymentMethod = 'Wallet';
            } else {
                matchQuery.paymentMethod = { $regex: new RegExp(paymentMethod, 'i') };
            }
        }

        if (orderStatus !== 'all') {
            matchQuery.status = { $regex: new RegExp(orderStatus, 'i') };
        }

        const orders = await Order.find(matchQuery)
            .populate('userId', 'fullname email')
            .sort({ createdAt: -1 });

        const ledgerEntries = [];
        let runningBalance = 0;

        for (const order of orders) {
            await order.populate({
                path: 'orderedItems.product',
                select: 'regularPrice salePrice productOffer'
            });
            
            let activeTotalRegularPrice = 0;
            let activeTotalProductDiscount = 0;
            let activeTotalFinalPrice = 0;
            
            for (const item of order.orderedItems) {
                if (item.product && item.status === 'Active') {
                    const regularPrice = item.product.regularPrice || 0;
                    const quantity = item.quantity || 0;
                    const itemRegularTotal = regularPrice * quantity;
                    const itemFinalTotal = item.totalPrice || 0;
                    
                    activeTotalRegularPrice += itemRegularTotal;
                    activeTotalFinalPrice += itemFinalTotal;
                    
                    const itemProductDiscount = Math.max(0, itemRegularTotal - itemFinalTotal);
                    activeTotalProductDiscount += itemProductDiscount;
                }
            }
            
            let activeCouponDiscount = 0;
            const originalCouponDiscount = order.couponDiscount || 0;
            
            if (originalCouponDiscount > 0 && activeTotalRegularPrice > 0) {
                activeCouponDiscount = originalCouponDiscount;
            }
            
            const totalActiveDiscount = activeTotalProductDiscount + activeCouponDiscount;
            const calculatedFinalAmount = activeTotalRegularPrice - totalActiveDiscount;
            
            const isEntireCancelled = order.status && order.status.toLowerCase().includes('cancelled') && 
                                     !order.status.toLowerCase().includes('partially');
            
            const displayFinalAmount = isEntireCancelled ? 0 : Math.max(0, calculatedFinalAmount);
            
            runningBalance += displayFinalAmount;
            
            ledgerEntries.push({
                date: order.createdAt.toLocaleDateString('en-GB'),
                orderId: order.orderId || 'N/A',
                customer: order.userId ? order.userId.fullname : 'Guest',
                description: `Sale - ${order.paymentMethod}`,
                debit: 0,
                credit: displayFinalAmount,
                balance: runningBalance,
                status: order.status || 'Pending',
                paymentMethod: order.paymentMethod || 'N/A'
            });
        }

        const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit, 0);
        const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit, 0);
        const netBalance = totalCredit - totalDebit;

        const ledgerSummary = {
            totalEntries: ledgerEntries.length,
            totalCredit: totalCredit,
            totalDebit: totalDebit,
            netBalance: netBalance,
            openingBalance: 0,
            closingBalance: netBalance
        };

        return {
            entries: ledgerEntries,
            summary: ledgerSummary
        };
    },

    exportLedgerPDF: async (req, res) => {
        try {
            const filters = req.query;
            const { entries, summary } = await ledgerController.getLedgerData(filters);

            const doc = new PDFDocument({ 
                margin: 50,
                size: 'A4',
                layout: 'landscape'
            });
            
            const filename = `ArvenClaire-Ledger-Report-${new Date().toISOString().split('T')[0]}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            doc.pipe(res);

            // Page dimensions and layout constants (landscape)
            const pageWidth = 841.89;
            const pageHeight = 595.28;
            const margin = 50;
            const usableWidth = pageWidth - (margin * 2);

            // Company header section
            doc.rect(margin, margin, usableWidth, 70).fill('#f8f9fa');
            doc.strokeColor('#dee2e6').rect(margin, margin, usableWidth, 70).stroke();
            
            // Company name
            doc.fontSize(26).fillColor('#2c3e50');
            doc.text('ARVENCLAIRE', margin + 20, margin + 12, { align: 'center', width: usableWidth - 40 });
            
            // Report title
            doc.fontSize(14).fillColor('#34495e');
            doc.text('General Ledger Report', margin + 20, margin + 45, { align: 'center', width: usableWidth - 40 });

            let currentY = margin + 90;
            
            // Report generation info section
            doc.rect(margin, currentY, usableWidth, 50).fill('#e8f4fd');
            doc.strokeColor('#3498db').rect(margin, currentY, usableWidth, 50).stroke();
            
            doc.fontSize(11).fillColor('#2c3e50');
            doc.text('Report Information', margin + 15, currentY + 8);
            
            doc.fontSize(10).fillColor('#34495e');
            const currentDate = new Date();
            doc.text(`Generated: ${currentDate.toLocaleDateString('en-GB')} at ${currentDate.toLocaleTimeString('en-GB')}`, 
                     margin + 15, currentY + 22);
            
            let periodText = `Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`;
            if (filters.startDate && filters.endDate) {
                periodText = `Custom Period: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`;
            }
            doc.text(periodText + ` | Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`, 
                     margin + 15, currentY + 34);
            
            currentY += 70;

            // Ledger Summary Section
            doc.fontSize(16).fillColor('#2c3e50');
            doc.text('LEDGER SUMMARY', margin, currentY, { align: 'center', width: usableWidth });
            currentY += 25;
            
            // Summary cards layout (3 cards in landscape)
            const cardWidth = (usableWidth - 40) / 3;
            const cardHeight = 70;
            const cardSpacing = 20;
            
            // Card 1: Opening & Closing Balance
            doc.rect(margin, currentY, cardWidth, cardHeight).fill('#e8f5e8');
            doc.strokeColor('#27ae60').rect(margin, currentY, cardWidth, cardHeight).stroke();
            doc.fontSize(11).fillColor('#27ae60');
            doc.text('BALANCE SUMMARY', margin + 10, currentY + 8, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(10).fillColor('#2c3e50');
            doc.text(`Opening: ₹${summary.openingBalance.toLocaleString('en-IN')}`, margin + 10, currentY + 25, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(12).fillColor('#2c3e50');
            doc.text(`Closing: ₹${summary.closingBalance.toLocaleString('en-IN')}`, margin + 10, currentY + 42, { width: cardWidth - 20, align: 'center' });
            
            // Card 2: Credits & Debits
            doc.rect(margin + cardWidth + cardSpacing, currentY, cardWidth, cardHeight).fill('#fff3cd');
            doc.strokeColor('#f39c12').rect(margin + cardWidth + cardSpacing, currentY, cardWidth, cardHeight).stroke();
            doc.fontSize(11).fillColor('#f39c12');
            doc.text('TRANSACTION SUMMARY', margin + cardWidth + cardSpacing + 10, currentY + 8, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(10).fillColor('#2c3e50');
            doc.text(`Credits: ₹${summary.totalCredit.toLocaleString('en-IN')}`, margin + cardWidth + cardSpacing + 10, currentY + 25, { width: cardWidth - 20, align: 'center' });
            doc.text(`Debits: ₹${summary.totalDebit.toLocaleString('en-IN')}`, margin + cardWidth + cardSpacing + 10, currentY + 42, { width: cardWidth - 20, align: 'center' });
            
            // Card 3: Net Balance & Entries
            doc.rect(margin + (cardWidth + cardSpacing) * 2, currentY, cardWidth, cardHeight).fill('#f8d7da');
            doc.strokeColor('#e74c3c').rect(margin + (cardWidth + cardSpacing) * 2, currentY, cardWidth, cardHeight).stroke();
            doc.fontSize(11).fillColor('#e74c3c');
            doc.text('NET POSITION', margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 8, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(12).fillColor('#2c3e50');
            doc.text(`₹${summary.netBalance.toLocaleString('en-IN')}`, margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 25, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(9).fillColor('#34495e');
            doc.text(`${summary.totalEntries} Entries`, margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 50, { width: cardWidth - 20, align: 'center' });
            
            currentY += cardHeight + 30;

            // Performance Metrics Table
            doc.fontSize(14).fillColor('#2c3e50');
            doc.text('FINANCIAL METRICS', margin, currentY, { align: 'center', width: usableWidth });
            currentY += 25;
            
            const metricsTableY = currentY;
            const metricsRowHeight = 22;
            const metricsColWidths = [usableWidth * 0.35, usableWidth * 0.25, usableWidth * 0.4];
            let metricsColX = [margin, margin + metricsColWidths[0], margin + metricsColWidths[0] + metricsColWidths[1]];
            
            // Metrics table header
            doc.rect(margin, metricsTableY, usableWidth, metricsRowHeight).fill('#3498db');
            doc.strokeColor('#2980b9').rect(margin, metricsTableY, usableWidth, metricsRowHeight).stroke();
            doc.fontSize(11).fillColor('#ffffff');
            doc.text('Financial Metric', metricsColX[0] + 10, metricsTableY + 7, { width: metricsColWidths[0] - 20, align: 'left' });
            doc.text('Amount', metricsColX[1] + 10, metricsTableY + 7, { width: metricsColWidths[1] - 20, align: 'center' });
            doc.text('Description', metricsColX[2] + 10, metricsTableY + 7, { width: metricsColWidths[2] - 20, align: 'center' });
            
            const metricsData = [
                ['Total Revenue (Credits)', `₹${summary.totalCredit.toLocaleString('en-IN')}`, 'Sales and income transactions'],
                ['Total Expenses (Debits)', `₹${summary.totalDebit.toLocaleString('en-IN')}`, 'Refunds and expense transactions'],
                ['Net Cash Flow', `₹${summary.netBalance.toLocaleString('en-IN')}`, 'Credits minus debits'],
                ['Average Transaction', `₹${summary.totalEntries > 0 ? Math.round(summary.totalCredit / summary.totalEntries).toLocaleString('en-IN') : '0'}`, 'Average credit per transaction']
            ];
            
            metricsData.forEach((row, index) => {
                const rowY = metricsTableY + metricsRowHeight + (index * metricsRowHeight);
                const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                
                doc.rect(margin, rowY, usableWidth, metricsRowHeight).fill(bgColor);
                doc.strokeColor('#dee2e6').rect(margin, rowY, usableWidth, metricsRowHeight).stroke();
                
                doc.fontSize(10).fillColor('#2c3e50');
                doc.text(row[0], metricsColX[0] + 10, rowY + 7, { width: metricsColWidths[0] - 20, align: 'left' });
                doc.text(row[1], metricsColX[1] + 10, rowY + 7, { width: metricsColWidths[1] - 20, align: 'center' });
                doc.text(row[2], metricsColX[2] + 10, rowY + 7, { width: metricsColWidths[2] - 20, align: 'left' });
            });
            
            currentY = metricsTableY + metricsRowHeight + (metricsData.length * metricsRowHeight) + 30;

            // Check if we need a new page for ledger entries
            if (currentY > pageHeight - margin - 200) {
                doc.addPage();
                currentY = margin + 20;
            }

            // Ledger Entries Section
            if (entries.length > 0) {
                doc.fontSize(14).fillColor('#2c3e50');
                doc.text('DETAILED LEDGER ENTRIES', margin, currentY, { align: 'center', width: usableWidth });
                currentY += 15;
                
                doc.fontSize(10).fillColor('#6c757d');
                doc.text(`Showing ${Math.min(entries.length, 20)} of ${entries.length} entries`, margin, currentY, { align: 'center', width: usableWidth });
                currentY += 25;
                
                const ledgerTableY = currentY;
                const ledgerRowHeight = 18;
                const ledgerColWidths = [
                    usableWidth * 0.1,   // Date
                    usableWidth * 0.12,  // Order ID
                    usableWidth * 0.15,  // Customer
                    usableWidth * 0.18,  // Description
                    usableWidth * 0.11,  // Debit
                    usableWidth * 0.11,  // Credit
                    usableWidth * 0.12,  // Balance
                    usableWidth * 0.11   // Status
                ];
                const ledgerColX = [];
                let ledgerCurrentX = margin;
                ledgerColWidths.forEach(width => {
                    ledgerColX.push(ledgerCurrentX);
                    ledgerCurrentX += width;
                });
                
                // Ledger table header
                doc.rect(margin, ledgerTableY, usableWidth, ledgerRowHeight).fill('#495057');
                doc.strokeColor('#343a40').rect(margin, ledgerTableY, usableWidth, ledgerRowHeight).stroke();
                doc.fontSize(10).fillColor('#ffffff');
                const ledgerHeaders = ['Date', 'Order ID', 'Customer', 'Description', 'Debit', 'Credit', 'Balance', 'Status'];
                ledgerHeaders.forEach((header, i) => {
                    doc.text(header, ledgerColX[i] + 5, ledgerTableY + 5, { width: ledgerColWidths[i] - 10, align: 'center' });
                });
                
                // Ledger data rows
                const maxLedgerRows = Math.min(entries.length, 20);
                entries.slice(0, maxLedgerRows).forEach((entry, index) => {
                    const rowY = ledgerTableY + ledgerRowHeight + (index * ledgerRowHeight);
                    const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                    
                    // Draw row background
                    doc.rect(margin, rowY, usableWidth, ledgerRowHeight).fill(bgColor);
                    doc.strokeColor('#dee2e6').rect(margin, rowY, usableWidth, ledgerRowHeight).stroke();
                    
                    // Prepare row data
                    const ledgerRowData = [
                        entry.date,
                        entry.orderId.length > 12 ? entry.orderId.substring(0, 12) + '...' : entry.orderId,
                        entry.customer.length > 15 ? entry.customer.substring(0, 15) + '...' : entry.customer,
                        entry.description.length > 18 ? entry.description.substring(0, 18) + '...' : entry.description,
                        entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-',
                        entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-',
                        `₹${entry.balance.toLocaleString('en-IN')}`,
                        entry.status.length > 8 ? entry.status.substring(0, 8) + '...' : entry.status
                    ];
                    
                    // Draw each cell
                    ledgerRowData.forEach((data, i) => {
                        let align = 'left';
                        let textColor = '#2c3e50';
                        
                        // Set alignment based on column
                        if (i >= 4 && i <= 6) align = 'right'; // Amount columns
                        else if (i === 7) align = 'center'; // Status column
                        
                        // Color coding for amounts
                        if (i === 4 && entry.debit > 0) {
                            textColor = '#e74c3c'; // Red for debits
                        } else if (i === 5 && entry.credit > 0) {
                            textColor = '#27ae60'; // Green for credits
                        }
                        
                        doc.fontSize(8).fillColor(textColor);
                        doc.text(data, ledgerColX[i] + 5, rowY + 5, { 
                            width: ledgerColWidths[i] - 10, 
                            align: align
                        });
                    });
                });
                
                // Totals row
                const totalRowY = ledgerTableY + ledgerRowHeight + (maxLedgerRows * ledgerRowHeight);
                doc.rect(margin, totalRowY, usableWidth, ledgerRowHeight).fill('#e8f4fd');
                doc.strokeColor('#3498db').rect(margin, totalRowY, usableWidth, ledgerRowHeight).stroke();
                
                const totalRowData = [
                    'TOTAL',
                    '',
                    '',
                    '',
                    summary.totalDebit > 0 ? `₹${summary.totalDebit.toLocaleString('en-IN')}` : '-',
                    summary.totalCredit > 0 ? `₹${summary.totalCredit.toLocaleString('en-IN')}` : '-',
                    `₹${summary.closingBalance.toLocaleString('en-IN')}`,
                    ''
                ];
                
                totalRowData.forEach((data, i) => {
                    let align = 'left';
                    if (i >= 4 && i <= 6) align = 'right'; // Amount columns
                    else if (i === 7) align = 'center'; // Status column
                    
                    doc.fontSize(9).fillColor('#2c3e50');
                    doc.text(data, ledgerColX[i] + 5, totalRowY + 5, { 
                        width: ledgerColWidths[i] - 10, 
                        align: align
                    });
                });
                
                if (entries.length > maxLedgerRows) {
                    currentY = totalRowY + ledgerRowHeight + 15;
                    doc.fontSize(9).fillColor('#6c757d');
                    doc.text(`Note: Showing first ${maxLedgerRows} entries out of ${entries.length} total entries.`, 
                             margin, currentY, { align: 'center', width: usableWidth });
                }
            }

            // Footer
            const footerY = pageHeight - margin - 30;
            doc.strokeColor('#dee2e6').lineWidth(1)
               .moveTo(margin, footerY)
               .lineTo(pageWidth - margin, footerY)
               .stroke();
            
            doc.fontSize(8).fillColor('#6c757d');
            doc.text(`ArvenClaire Ledger Report - Generated on ${new Date().toLocaleDateString('en-GB')}`, 
                     margin, footerY + 5, { align: 'center', width: usableWidth });
            doc.text('* All amounts in Indian Rupees (₹). Credits represent sales revenue, debits represent expenses/refunds.', 
                     margin, footerY + 15, { align: 'center', width: usableWidth });

            doc.end();

        } catch (error) {
            console.error('Error exporting ledger PDF:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export ledger PDF: ' + error.message
            });
        }
    },

    exportLedgerExcel: async (req, res) => {
        try {
            const filters = req.query;
            const { entries, summary } = await ledgerController.getLedgerData(filters);

            const workbook = new ExcelJS.Workbook();
            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `ArvenClaire-Ledger-Report-${currentDate}.xlsx`;

            workbook.creator = 'ArvenClaire Ledger System';
            workbook.lastModifiedBy = 'ArvenClaire Ledger System';
            workbook.created = new Date();
            workbook.modified = new Date();

            const summarySheet = workbook.addWorksheet('Ledger Summary');
            
            summarySheet.mergeCells('A1:H1');
            summarySheet.getCell('A1').value = 'ARVENCLAIRE - GENERAL LEDGER REPORT';
            summarySheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF000000' } };
            summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
            summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };

            summarySheet.mergeCells('A2:H2');
            summarySheet.getCell('A2').value = `Report Generated: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`;
            summarySheet.getCell('A2').alignment = { horizontal: 'center' };
            summarySheet.getCell('A2').font = { size: 11, italic: true };

            let filterInfo = `Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`;
            if (filters.startDate && filters.endDate) {
                filterInfo = `Custom Period: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`;
            }
            filterInfo += ` | Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`;
            
            summarySheet.mergeCells('A3:H3');
            summarySheet.getCell('A3').value = filterInfo;
            summarySheet.getCell('A3').alignment = { horizontal: 'center' };
            summarySheet.getCell('A3').font = { size: 10, bold: true };

            summarySheet.getCell('A5').value = 'LEDGER SUMMARY';
            summarySheet.getCell('A5').font = { size: 14, bold: true, color: { argb: 'FF2E75B6' } };
            summarySheet.mergeCells('A5:H5');
            summarySheet.getCell('A5').alignment = { horizontal: 'center' };

            const summaryHeaders = ['Metric', 'Amount', 'Description'];
            summaryHeaders.forEach((header, index) => {
                const cell = summarySheet.getCell(7, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            const summaryData = [
                ['Opening Balance', `₹${summary.openingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Balance at start of period'],
                ['Total Credits', `₹${summary.totalCredit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Total sales revenue'],
                ['Total Debits', `₹${summary.totalDebit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Total expenses/refunds'],
                ['Net Balance', `₹${summary.netBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Credits minus debits'],
                ['Closing Balance', `₹${summary.closingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Final balance'],
                ['Total Entries', summary.totalEntries.toLocaleString('en-IN'), 'Number of ledger entries']
            ];

            summaryData.forEach((row, index) => {
                const rowNum = index + 8;
                row.forEach((value, colIndex) => {
                    const cell = summarySheet.getCell(rowNum, colIndex + 1);
                    cell.value = value;
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                    if (colIndex === 0) {
                        cell.font = { bold: true };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                    }
                    if (colIndex === 1) {
                        cell.font = { bold: true, color: { argb: 'FF2E75B6' } };
                        cell.alignment = { horizontal: 'right' };
                    }
                });
            });

            summarySheet.columns = [
                { width: 25 }, { width: 20 }, { width: 35 }, { width: 15 },
                { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
            ];

            const entriesSheet = workbook.addWorksheet('Ledger Entries');
            
            entriesSheet.getCell('A1').value = 'DETAILED LEDGER ENTRIES';
            entriesSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            entriesSheet.mergeCells('A1:I1');
            entriesSheet.getCell('A1').alignment = { horizontal: 'center' };

            entriesSheet.getCell('A2').value = `Total Entries: ${entries.length}`;
            entriesSheet.getCell('A2').font = { size: 12, bold: true };

            const ledgerHeaders = [
                'Date', 'Order ID', 'Customer', 'Description', 'Debit Amount', 
                'Credit Amount', 'Running Balance', 'Status', 'Payment Method'
            ];
            
            ledgerHeaders.forEach((header, index) => {
                const cell = entriesSheet.getCell(4, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            entries.forEach((entry, index) => {
                const row = index + 5;
                const entryData = [
                    entry.date,
                    entry.orderId,
                    entry.customer,
                    entry.description,
                    entry.debit,
                    entry.credit,
                    entry.balance,
                    entry.status,
                    entry.paymentMethod
                ];
                
                entryData.forEach((value, colIndex) => {
                    const cell = entriesSheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 4 && colIndex <= 6) {
                        cell.value = value;
                        cell.numFmt = '₹#,##0.00';
                    } else {
                        cell.value = value;
                    }
                    
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                    
                    if (index % 2 === 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
                    }
                    
                    if (colIndex === 7) {
                        if (value && value.toLowerCase().includes('delivered')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('cancelled')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('pending')) {
                            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                        }
                    }
                    
                    if (colIndex === 4 && value > 0) {
                        cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                    }
                    if (colIndex === 5 && value > 0) {
                        cell.font = { color: { argb: 'FF008000' }, bold: true };
                    }
                });
            });

            const totalRow = entries.length + 5;
            const totalData = [
                'TOTAL',
                '',
                '',
                '',
                summary.totalDebit,
                summary.totalCredit,
                summary.closingBalance,
                '',
                ''
            ];
            
            totalData.forEach((value, colIndex) => {
                const cell = entriesSheet.getCell(totalRow, colIndex + 1);
                
                if (typeof value === 'number' && colIndex >= 4 && colIndex <= 6) {
                    cell.value = value;
                    cell.numFmt = '₹#,##0.00';
                } else {
                    cell.value = value;
                }
                
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
                cell.border = {
                    top: { style: 'thick' }, left: { style: 'thin' },
                    bottom: { style: 'thick' }, right: { style: 'thin' }
                };
            });

            entriesSheet.columns = [
                { width: 12 }, { width: 15 }, { width: 20 }, { width: 25 }, { width: 15 },
                { width: 15 }, { width: 18 }, { width: 15 }, { width: 18 }
            ];

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error exporting ledger Excel:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export ledger Excel: ' + error.message
            });
        }
    }
};

module.exports = ledgerController;