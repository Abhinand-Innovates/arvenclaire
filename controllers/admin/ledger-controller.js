const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');




const ledgerController = {
    // Helper function to get ledger data
    getLedgerData: async (filters) => {
        const { 
            timePeriod = 'monthly', 
            paymentMethod = 'all', 
            orderStatus = 'all',
            startDate,
            endDate
        } = filters;

        // Calculate date range based on time period or custom dates
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

        // Build query filters
        const matchQuery = {
            createdAt: { $gte: startDateObj, $lte: endDateObj }
        };

        // Add payment method filter
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

        // Add order status filter
        if (orderStatus !== 'all') {
            matchQuery.status = { $regex: new RegExp(orderStatus, 'i') };
        }

        // Get all orders
        const orders = await Order.find(matchQuery)
            .populate('userId', 'fullname email')
            .sort({ createdAt: -1 });

        // Format ledger entries
        const ledgerEntries = [];
        let runningBalance = 0;

        for (const order of orders) {
            await order.populate({
                path: 'orderedItems.product',
                select: 'regularPrice salePrice productOffer'
            });
            
            // Calculate totals for active items only
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
            
            // Calculate coupon discount
            let activeCouponDiscount = 0;
            const originalCouponDiscount = order.couponDiscount || 0;
            
            if (originalCouponDiscount > 0 && activeTotalRegularPrice > 0) {
                activeCouponDiscount = originalCouponDiscount;
            }
            
            const totalActiveDiscount = activeTotalProductDiscount + activeCouponDiscount;
            const calculatedFinalAmount = activeTotalRegularPrice - totalActiveDiscount;
            
            // Handle entirely cancelled orders
            const isEntireCancelled = order.status && order.status.toLowerCase().includes('cancelled') && 
                                     !order.status.toLowerCase().includes('partially');
            
            const displayFinalAmount = isEntireCancelled ? 0 : Math.max(0, calculatedFinalAmount);
            
            // Add to running balance (credit for sales)
            runningBalance += displayFinalAmount;
            
            ledgerEntries.push({
                date: order.createdAt.toLocaleDateString('en-GB'),
                orderId: order.orderId || 'N/A',
                customer: order.userId ? order.userId.fullname : 'Guest',
                description: `Sale - ${order.paymentMethod}`,
                debit: 0, // No debit for sales
                credit: displayFinalAmount,
                balance: runningBalance,
                status: order.status || 'Pending',
                paymentMethod: order.paymentMethod || 'N/A'
            });
        }

        // Calculate summary statistics
        const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit, 0);
        const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit, 0);
        const netBalance = totalCredit - totalDebit;

        const ledgerSummary = {
            totalEntries: ledgerEntries.length,
            totalCredit: totalCredit,
            totalDebit: totalDebit,
            netBalance: netBalance,
            openingBalance: 0, // Can be customized based on business needs
            closingBalance: netBalance
        };

        return {
            entries: ledgerEntries,
            summary: ledgerSummary
        };
    },

    // Export Ledger Report as PDF
    exportLedgerPDF: async (req, res) => {
        try {
            const filters = req.query;
            const { entries, summary } = await ledgerController.getLedgerData(filters);

            // Create a new PDF document in landscape orientation with optimized margins
            const doc = new PDFDocument({ 
                margin: {
                    top: 40,
                    bottom: 40,
                    left: 25,
                    right: 25
                },
                size: 'A4',
                layout: 'landscape'
            });
            
            const filename = `ArvenClaire-Ledger-Report-${new Date().toISOString().split('T')[0]}.pdf`;

            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Pipe the PDF to the response
            doc.pipe(res);

            // Page dimensions for landscape A4 with optimized margins
            const pageWidth = 841.89; // A4 landscape width
            const pageHeight = 595.28; // A4 landscape height
            const leftMargin = 25;
            const rightMargin = 25;
            const topMargin = 40;
            const bottomMargin = 40;
            const usableWidth = pageWidth - leftMargin - rightMargin; // 791.89px usable width
            const usableHeight = pageHeight - topMargin - bottomMargin; // 515.28px usable height

            // Company Header
            doc.fontSize(24).fillColor('#000000');
            doc.text('ARVENCLAIRE', { align: 'center' });
            doc.moveDown(0.3);
            
            doc.fontSize(16).fillColor('#666666');
            doc.text('General Ledger Report', { align: 'center' });
            doc.moveDown(1);
            
            // Report metadata
            doc.fontSize(11).fillColor('#333333');
            const currentDate = new Date();
            doc.text(`Generated: ${currentDate.toLocaleDateString('en-GB')} at ${currentDate.toLocaleTimeString('en-GB')}`, { align: 'center' });
            
            // Show custom date range if provided
            if (filters.startDate && filters.endDate) {
                doc.text(`Period: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`, { align: 'center' });
            } else {
                doc.text(`Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`, { align: 'center' });
            }
            
            doc.text(`Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`, { align: 'center' });
            doc.moveDown(1.5);

            // Ledger Summary
            doc.fontSize(16).fillColor('#000000');
            doc.text('LEDGER SUMMARY', { align: 'center', underline: true });
            doc.moveDown(1);
            
            // Summary in three columns for better horizontal space utilization
            doc.fontSize(11).fillColor('#333333');
            const col1 = leftMargin;
            const col2 = leftMargin + (usableWidth / 3);
            const col3 = leftMargin + (2 * usableWidth / 3);
            const colWidth = (usableWidth / 3) - 15;
            
            let summaryY = doc.y;
            
            // First row
            doc.text(`Opening Balance: ₹${summary.openingBalance.toLocaleString('en-IN')}`, col1, summaryY, { width: colWidth });
            doc.text(`Total Credits: ₹${summary.totalCredit.toLocaleString('en-IN')}`, col2, summaryY, { width: colWidth });
            doc.text(`Total Debits: ₹${summary.totalDebit.toLocaleString('en-IN')}`, col3, summaryY, { width: colWidth });
            summaryY += 18;
            
            // Second row
            doc.text(`Net Balance: ₹${summary.netBalance.toLocaleString('en-IN')}`, col1, summaryY, { width: colWidth });
            doc.text(`Closing Balance: ₹${summary.closingBalance.toLocaleString('en-IN')}`, col2, summaryY, { width: colWidth });
            doc.text(`Total Entries: ${summary.totalEntries.toLocaleString('en-IN')}`, col3, summaryY, { width: colWidth });
            
            doc.y = summaryY + 25;

            // Ledger Entries Table
            doc.fontSize(14).fillColor('#000000');
            doc.text('LEDGER ENTRIES', { align: 'center', underline: true });
            doc.moveDown(1);
            
            // Table headers - optimized for better spacing and readability
            doc.fontSize(10).fillColor('#000000');
            const tableY = doc.y;
            
            // Better distributed column widths for 791.89px usable width
            const colWidths = [70, 95, 115, 140, 80, 80, 85, 75, 75];
            const colX = [
                leftMargin, 
                leftMargin + 70, 
                leftMargin + 165, 
                leftMargin + 280, 
                leftMargin + 420, 
                leftMargin + 500, 
                leftMargin + 580, 
                leftMargin + 665,
                leftMargin + 740
            ];
            const headers = ['Date', 'Order ID', 'Customer', 'Description', 'Debit', 'Credit', 'Balance', 'Status', 'Payment'];
            
            headers.forEach((header, i) => {
                doc.text(header, colX[i], tableY, { width: colWidths[i], align: 'center' });
            });
            
            doc.y = tableY + 15;
            
            // Table rows - optimized for landscape layout with better spacing
            doc.fontSize(9);
            const maxRows = Math.min(entries.length, 30); // Optimal rows for better readability
            entries.slice(0, maxRows).forEach((entry, index) => {
                const rowY = doc.y;
                
                // Alternate row background (visual enhancement)
                if (index % 2 === 0) {
                    doc.rect(leftMargin - 5, rowY - 2, usableWidth + 10, 12)
                       .fillColor('#f8f9fa')
                       .fill();
                    doc.fillColor('#333333'); // Reset text color
                }
                
                doc.text(entry.date, colX[0], rowY, { width: colWidths[0], align: 'left' });
                doc.text(entry.orderId.length > 11 ? entry.orderId.substring(0, 11) + '...' : entry.orderId, colX[1], rowY, { width: colWidths[1], align: 'left' });
                doc.text(entry.customer.length > 14 ? entry.customer.substring(0, 14) + '...' : entry.customer, colX[2], rowY, { width: colWidths[2], align: 'left' });
                doc.text(entry.description.length > 17 ? entry.description.substring(0, 17) + '...' : entry.description, colX[3], rowY, { width: colWidths[3], align: 'left' });
                doc.text(`₹${entry.debit.toLocaleString('en-IN')}`, colX[4], rowY, { width: colWidths[4], align: 'right' });
                doc.text(`₹${entry.credit.toLocaleString('en-IN')}`, colX[5], rowY, { width: colWidths[5], align: 'right' });
                doc.text(`₹${entry.balance.toLocaleString('en-IN')}`, colX[6], rowY, { width: colWidths[6], align: 'right' });
                doc.text(entry.status.length > 7 ? entry.status.substring(0, 7) + '...' : entry.status, colX[7], rowY, { width: colWidths[7], align: 'center' });
                doc.text(entry.paymentMethod.length > 8 ? entry.paymentMethod.substring(0, 8) + '...' : entry.paymentMethod, colX[8], rowY, { width: colWidths[8], align: 'center' });
                doc.y = rowY + 12;
            });

            // Show note if more entries exist
            if (entries.length > maxRows) {
                doc.moveDown(0.5);
                doc.fontSize(8).fillColor('#666666');
                doc.text(`Note: Showing first ${maxRows} entries. Total: ${entries.length}`, { align: 'center' });
            }

            // Footer - adjusted for landscape layout
            doc.fontSize(8).fillColor('#666666');
            doc.text(`ArvenClaire Ledger Report - Generated on ${new Date().toLocaleDateString('en-GB')}`, 30, 550, { align: 'center', width: usableWidth });
            doc.text('* All amounts in Indian Rupees (₹). Credits represent sales revenue.', 30, 560, { align: 'center', width: usableWidth });

            // Finalize the PDF
            doc.end();

        } catch (error) {
            console.error('Error exporting ledger PDF:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export ledger PDF: ' + error.message
            });
        }
    },

    // Export Ledger Report as Excel
    exportLedgerExcel: async (req, res) => {
        try {
            const filters = req.query;
            const { entries, summary } = await ledgerController.getLedgerData(filters);

            // Create a new workbook
            const workbook = new ExcelJS.Workbook();
            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `ArvenClaire-Ledger-Report-${currentDate}.xlsx`;

            // Set workbook properties
            workbook.creator = 'ArvenClaire Ledger System';
            workbook.lastModifiedBy = 'ArvenClaire Ledger System';
            workbook.created = new Date();
            workbook.modified = new Date();

            // 1. LEDGER SUMMARY SHEET
            const summarySheet = workbook.addWorksheet('Ledger Summary');
            
            // Company Header
            summarySheet.mergeCells('A1:H1');
            summarySheet.getCell('A1').value = 'ARVENCLAIRE - GENERAL LEDGER REPORT';
            summarySheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF000000' } };
            summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
            summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };

            // Report metadata
            summarySheet.mergeCells('A2:H2');
            summarySheet.getCell('A2').value = `Report Generated: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`;
            summarySheet.getCell('A2').alignment = { horizontal: 'center' };
            summarySheet.getCell('A2').font = { size: 11, italic: true };

            // Filter information
            let filterInfo = `Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`;
            if (filters.startDate && filters.endDate) {
                filterInfo = `Custom Period: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`;
            }
            filterInfo += ` | Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`;
            
            summarySheet.mergeCells('A3:H3');
            summarySheet.getCell('A3').value = filterInfo;
            summarySheet.getCell('A3').alignment = { horizontal: 'center' };
            summarySheet.getCell('A3').font = { size: 10, bold: true };

            // Ledger Summary
            summarySheet.getCell('A5').value = 'LEDGER SUMMARY';
            summarySheet.getCell('A5').font = { size: 14, bold: true, color: { argb: 'FF2E75B6' } };
            summarySheet.mergeCells('A5:H5');
            summarySheet.getCell('A5').alignment = { horizontal: 'center' };

            // Summary Table Headers
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

            // Summary Data
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

            // Set column widths for summary
            summarySheet.columns = [
                { width: 25 }, { width: 20 }, { width: 35 }, { width: 15 },
                { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
            ];

            // 2. DETAILED LEDGER ENTRIES SHEET
            const entriesSheet = workbook.addWorksheet('Ledger Entries');
            
            // Headers
            entriesSheet.getCell('A1').value = 'DETAILED LEDGER ENTRIES';
            entriesSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            entriesSheet.mergeCells('A1:I1');
            entriesSheet.getCell('A1').alignment = { horizontal: 'center' };

            entriesSheet.getCell('A2').value = `Total Entries: ${entries.length}`;
            entriesSheet.getCell('A2').font = { size: 12, bold: true };

            // Ledger table headers
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

            // Add ledger entries data
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
                        // Format currency columns
                        cell.value = value;
                        cell.numFmt = '₹#,##0.00';
                    } else {
                        cell.value = value;
                    }
                    
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                    
                    // Alternate row colors
                    if (index % 2 === 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
                    }
                    
                    // Status color coding
                    if (colIndex === 7) { // Status
                        if (value && value.toLowerCase().includes('delivered')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('cancelled')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('pending')) {
                            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                        }
                    }
                    
                    // Credit/Debit color coding
                    if (colIndex === 4 && value > 0) { // Debit
                        cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                    }
                    if (colIndex === 5 && value > 0) { // Credit
                        cell.font = { color: { argb: 'FF008000' }, bold: true };
                    }
                });
            });

            // Add totals row
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

            // Set column widths for entries
            entriesSheet.columns = [
                { width: 12 }, { width: 15 }, { width: 20 }, { width: 25 }, { width: 15 },
                { width: 15 }, { width: 18 }, { width: 15 }, { width: 18 }
            ];

            // Set response headers for Excel download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Write to response
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