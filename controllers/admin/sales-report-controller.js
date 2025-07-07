const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');




const salesReportController = {
    // Helper function to get filtered data
    getFilteredData: async (filters) => {
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
            // Parse custom dates and set proper time boundaries
            startDateObj = new Date(startDate);
            endDateObj = new Date(endDate);
            
            // Validate that dates are valid
            if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
                throw new Error('Invalid date format provided');
            }
            
            // Validate that start date is not after end date
            if (startDateObj > endDateObj) {
                throw new Error('Start date cannot be after end date');
            }
            
            // Set start date to beginning of day (00:00:00)
            startDateObj.setHours(0, 0, 0, 0);
            
            // Set end date to end of day (23:59:59)
            endDateObj.setHours(23, 59, 59, 999);
            
            // Log for debugging (remove in production)
            if (process.env.NODE_ENV === 'development') {
                console.log('Custom date filtering:', {
                    originalStart: startDate,
                    originalEnd: endDate,
                    parsedStart: startDateObj,
                    parsedEnd: endDateObj,
                    timePeriod: timePeriod
                });
            }
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

        // Get all orders (no pagination for export)
        const orders = await Order.find(matchQuery)
            .populate('userId', 'fullname')
            .sort({ createdAt: -1 });

        // Format data with discount calculations based on active products only
        const formattedOrders = await Promise.all(orders.map(async (order) => {
            // Populate product details for each ordered item to get regular prices
            await order.populate({
                path: 'orderedItems.product',
                select: 'regularPrice salePrice productOffer'
            });
            
            // Calculate totals for active items only
            let activeTotalRegularPrice = 0;
            let activeTotalSalePrice = 0;
            let activeTotalProductDiscount = 0;
            let activeTotalFinalPrice = 0;
            
            // Process each item in the order
            for (const item of order.orderedItems) {
                if (item.product) {
                    const regularPrice = item.product.regularPrice || 0;
                    const salePrice = item.product.salePrice || regularPrice;
                    const quantity = item.quantity || 0;
                    const itemRegularTotal = regularPrice * quantity;
                    const itemSaleTotal = salePrice * quantity;
                    const itemFinalTotal = item.totalPrice || 0;
                    
                    // Only include active items in final calculations
                    if (item.status === 'Active') {
                        activeTotalRegularPrice += itemRegularTotal;
                        activeTotalSalePrice += itemSaleTotal;
                        activeTotalFinalPrice += itemFinalTotal;
                        
                        // Calculate product-level discount for this active item
                        // This includes both regular-to-sale price discount and any additional item-level discounts
                        const itemProductDiscount = Math.max(0, itemRegularTotal - itemFinalTotal);
                        activeTotalProductDiscount += itemProductDiscount;
                    }
                }
            }
            
            // Calculate coupon discount - add the full coupon amount if coupon was applied
            let activeCouponDiscount = 0;
            const originalCouponDiscount = order.couponDiscount || 0;
            
            // If there are active items and a coupon was applied, include the full coupon discount
            if (originalCouponDiscount > 0 && activeTotalRegularPrice > 0) {
                activeCouponDiscount = originalCouponDiscount;
            }
            
            // Total discount for active items = product discounts + coupon discount (if applicable)
            const totalActiveDiscount = activeTotalProductDiscount + activeCouponDiscount;
            
            // Calculate final amount for active items
            const calculatedFinalAmount = activeTotalRegularPrice - totalActiveDiscount;
            
            // Handle entirely cancelled orders
            const isEntireCancelled = order.status && order.status.toLowerCase().includes('cancelled') && 
                                     !order.status.toLowerCase().includes('partially');
            
            // For entirely cancelled orders, show zero values
            const displayAmount = isEntireCancelled ? 0 : activeTotalRegularPrice;
            const displayDiscount = isEntireCancelled ? 0 : totalActiveDiscount;
            const displayFinalAmount = isEntireCancelled ? 0 : Math.max(0, calculatedFinalAmount);
            
            return {
                orderId: order.orderId || 'N/A',
                date: order.createdAt ? order.createdAt.toLocaleDateString('en-GB') : 'N/A',
                customer: order.userId ? order.userId.fullname : 'Guest',
                paymentMethod: order.paymentMethod || 'N/A',
                status: order.status || 'Pending',
                amount: displayAmount, // Regular price total for active items only
                discount: displayDiscount, // Sum of actual discounts from active items + full coupon discount
                finalAmount: displayFinalAmount, // Net amount after discounts
                // Debug information (can be removed in production)
                debug: {
                    activeTotalRegularPrice,
                    activeTotalProductDiscount,
                    activeCouponDiscount,
                    totalActiveDiscount,
                    activeItemsCount: order.orderedItems.filter(item => item.status === 'Active').length,
                    totalItemsCount: order.orderedItems.length
                }
            };
        }));

        // Calculate statistics based on the corrected values from formatted orders
        let totalRegularPriceRevenue = 0;
        let totalDiscountAmount = 0;
        let totalFinalAmount = 0;
        
        for (const order of formattedOrders) {
            totalRegularPriceRevenue += order.amount;
            totalDiscountAmount += order.discount;
            totalFinalAmount += order.finalAmount;
        }
        
        const salesStats = {
            totalRevenue: totalRegularPriceRevenue, // Total of Amount column (active items only)
            totalOrders: formattedOrders.length,
            totalDiscount: totalDiscountAmount, // Sum of actual discounts from active items + coupon discounts
            averageOrder: formattedOrders.length > 0 ? totalFinalAmount / formattedOrders.length : 0,
            netRevenue: totalFinalAmount, // Total of Final Amount column (after actual discounts)
            regularPriceTotal: totalRegularPriceRevenue // Keep regular price total for reference
        };

        // Get daily sales analysis with corrected calculations
        const dailyAnalysisMap = new Map();
        
        // Group orders by date and calculate corrected totals
        for (const order of formattedOrders) {
            const dateKey = order.date;
            if (!dailyAnalysisMap.has(dateKey)) {
                dailyAnalysisMap.set(dateKey, {
                    orders: 0,
                    revenue: 0,
                    discount: 0,
                    netRevenue: 0
                });
            }
            
            const dayData = dailyAnalysisMap.get(dateKey);
            dayData.orders += 1;
            dayData.revenue += order.amount; // Regular price total for active items
            dayData.discount += order.discount; // Sum of actual discounts from active items + coupon
            dayData.netRevenue += order.finalAmount; // Final amount after actual discounts
        }
        
        // Convert map to array and sort by date
        const formattedAnalysis = Array.from(dailyAnalysisMap.entries())
            .map(([date, data]) => ({
                date,
                orders: data.orders,
                revenue: data.revenue,
                discount: data.discount,
                netRevenue: data.netRevenue
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
            orders: formattedOrders,
            salesStats,
            dailyAnalysis: formattedAnalysis
        };
    },

    // Get Sales Report Page
    getSalesReport: async (req, res) => {
        try {
            // Get filter parameters from query
            const { 
                timePeriod = 'monthly', 
                paymentMethod = 'all', 
                orderStatus = 'all',
                page = 1,
                limit = 10,
                startDate,
                endDate
            } = req.query;

            // Get filtered data using helper function
            const { orders: allOrders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData({
                timePeriod,
                paymentMethod,
                orderStatus,
                startDate,
                endDate
            });

            // Apply pagination to orders
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const paginatedOrders = allOrders.slice(skip, skip + parseInt(limit));
            const totalOrders = allOrders.length;
            const totalPages = Math.ceil(totalOrders / parseInt(limit));

            // Render the sales report page
            res.render('sales-report', {
                title: 'Sales Report',
                orders: paginatedOrders,
                salesStats,
                dailyAnalysis: dailyAnalysis.slice(0, 10), // Limit to 10 for display
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalOrders,
                    hasNext: parseInt(page) < totalPages,
                    hasPrev: parseInt(page) > 1
                },
                filters: {
                    timePeriod,
                    paymentMethod,
                    orderStatus,
                    startDate,
                    endDate
                }
            });

        } catch (error) {
            console.error('Error fetching sales report:', error);
            
            // Handle validation errors differently
            if (error.message.includes('Invalid date') || error.message.includes('Start date cannot')) {
                return res.status(400).render('sales-report', {
                    title: 'Sales Report',
                    orders: [],
                    salesStats: {
                        totalRevenue: 0,
                        totalOrders: 0,
                        totalDiscount: 0,
                        averageOrder: 0,
                        netRevenue: 0
                    },
                    dailyAnalysis: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 1,
                        totalOrders: 0,
                        hasNext: false,
                        hasPrev: false
                    },
                    filters: {
                        timePeriod: req.query.timePeriod || 'monthly',
                        paymentMethod: req.query.paymentMethod || 'all',
                        orderStatus: req.query.orderStatus || 'all',
                        startDate: req.query.startDate || '',
                        endDate: req.query.endDate || ''
                    },
                    error: error.message
                });
            }
            
            res.status(500).render('admin/error', {
                title: 'Error',
                message: 'Failed to load sales report',
                error: error.message
            });
        }
    },

    // Export Sales Report as PDF
    exportPDF: async (req, res) => {
        try {
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            // Create a new PDF document with standard settings
            const doc = new PDFDocument({ 
                margin: 40,
                size: 'A4'
            });
            
            const filename = `ArvenClaire-Sales-Report-${new Date().toISOString().split('T')[0]}.pdf`;

            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Pipe the PDF to the response
            doc.pipe(res);

            // Page dimensions
            const pageWidth = 595.28;
            const leftMargin = 40;
            const usableWidth = pageWidth - 80; // 40px margins on each side

            // Company Header
            doc.fontSize(24).fillColor('#000000');
            doc.text('ARVENCLAIRE', { align: 'center' });
            doc.moveDown(0.3);
            
            doc.fontSize(16).fillColor('#666666');
            doc.text('Sales Analytics Report', { align: 'center' });
            doc.moveDown(1);
            
            // Report metadata
            doc.fontSize(11).fillColor('#333333');
            const currentDate = new Date();
            doc.text(`Generated: ${currentDate.toLocaleDateString('en-GB')} at ${currentDate.toLocaleTimeString('en-GB')}`, { align: 'center' });
            
            // Show custom date range if provided
            if (filters.startDate && filters.endDate) {
                doc.text(`Custom Date Range: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`, { align: 'center' });
            } else {
                doc.text(`Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`, { align: 'center' });
            }
            
            doc.text(`Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`, { align: 'center' });
            doc.moveDown(1.5);

            // Executive Summary
            doc.fontSize(16).fillColor('#000000');
            doc.text('EXECUTIVE SUMMARY', { align: 'center', underline: true });
            doc.moveDown(1);
            
            // Summary in two columns
            doc.fontSize(10).fillColor('#333333');
            const leftCol = leftMargin;
            const rightCol = leftMargin + (usableWidth / 2);
            const colWidth = (usableWidth / 2) - 20;
            
            let summaryY = doc.y;
            
            doc.text(`Total Revenue (Gross): ₹${salesStats.totalRevenue.toLocaleString('en-IN')}`, leftCol, summaryY, { width: colWidth });
            doc.text(`Net Revenue (After Discounts): ₹${salesStats.netRevenue.toLocaleString('en-IN')}`, rightCol, summaryY, { width: colWidth });
            summaryY += 15;
            
            doc.text(`Total Orders: ${salesStats.totalOrders.toLocaleString('en-IN')}`, leftCol, summaryY, { width: colWidth });
            doc.text(`Average Order Value: ₹${Math.round(salesStats.averageOrder).toLocaleString('en-IN')}`, rightCol, summaryY, { width: colWidth });
            summaryY += 15;
            
            doc.text(`Total Discounts: ₹${salesStats.totalDiscount.toLocaleString('en-IN')}`, leftCol, summaryY, { width: colWidth });
            doc.text(`Discount %: ${((salesStats.totalDiscount / salesStats.totalRevenue) * 100).toFixed(1)}%`, rightCol, summaryY, { width: colWidth });
            
            doc.y = summaryY + 25;

            // Daily Performance Analysis
            doc.fontSize(14).fillColor('#000000');
            doc.text('DAILY PERFORMANCE ANALYSIS', { align: 'center', underline: true });
            doc.moveDown(1);
            
            // Simple table headers
            doc.fontSize(9).fillColor('#000000');
            const tableY = doc.y;
            const colWidths = [80, 60, 100, 100, 100];
            const colX = [leftMargin, leftMargin + 80, leftMargin + 140, leftMargin + 240, leftMargin + 340];
            const headers = ['Date', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];
            
            headers.forEach((header, i) => {
                doc.text(header, colX[i], tableY, { width: colWidths[i], align: 'center' });
            });
            
            doc.y = tableY + 15;
            
            // Table rows
            doc.fontSize(8);
            const maxRows = Math.min(dailyAnalysis.length, 12);
            dailyAnalysis.slice(0, maxRows).forEach((item) => {
                const rowY = doc.y;
                doc.text(item.date, colX[0], rowY, { width: colWidths[0], align: 'left' });
                doc.text(item.orders.toString(), colX[1], rowY, { width: colWidths[1], align: 'center' });
                doc.text(`₹${item.revenue.toLocaleString('en-IN')}`, colX[2], rowY, { width: colWidths[2], align: 'center' });
                doc.text(`₹${item.discount.toLocaleString('en-IN')}`, colX[3], rowY, { width: colWidths[3], align: 'center' });
                doc.text(`₹${item.netRevenue.toLocaleString('en-IN')}`, colX[4], rowY, { width: colWidths[4], align: 'center' });
                doc.y = rowY + 12;
            });

            // Totals row
            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('#000000');
            const totalY = doc.y;
            doc.text('TOTAL', colX[0], totalY, { width: colWidths[0], align: 'left' });
            doc.text(salesStats.totalOrders.toString(), colX[1], totalY, { width: colWidths[1], align: 'center' });
            doc.text(`₹${salesStats.totalRevenue.toLocaleString('en-IN')}`, colX[2], totalY, { width: colWidths[2], align: 'center' });
            doc.text(`₹${salesStats.totalDiscount.toLocaleString('en-IN')}`, colX[3], totalY, { width: colWidths[3], align: 'center' });
            doc.text(`₹${salesStats.netRevenue.toLocaleString('en-IN')}`, colX[4], totalY, { width: colWidths[4], align: 'center' });

            doc.y = totalY + 25;

            // Order Details Section
            doc.fontSize(14).fillColor('#000000');
            doc.text('DETAILED ORDER ANALYSIS', { align: 'center', underline: true });
            doc.moveDown(0.5);
            
            doc.fontSize(9).fillColor('#666666');
            doc.text(`Showing ${Math.min(orders.length, 18)} of ${orders.length} orders`, { align: 'center' });
            doc.moveDown(1);
            
            // Order table headers
            const orderHeaders = ['Order ID', 'Date', 'Customer', 'Payment', 'Status', 'Amount', 'Discount', 'Final'];
            const orderColWidths = [65, 55, 80, 65, 55, 65, 65, 65];
            const orderColX = [];
            let currentX = leftMargin;
            orderColWidths.forEach((width, i) => {
                orderColX.push(currentX);
                currentX += width;
            });
            
            doc.fontSize(8).fillColor('#000000');
            const orderHeaderY = doc.y;
            orderHeaders.forEach((header, i) => {
                doc.text(header, orderColX[i], orderHeaderY, { width: orderColWidths[i], align: 'center' });
            });
            
            doc.y = orderHeaderY + 15;
            
            // Order rows
            doc.fontSize(7);
            const maxOrdersToShow = Math.min(orders.length, 18);
            orders.slice(0, maxOrdersToShow).forEach((order, index) => {
                const orderRowY = doc.y;
                const orderRowData = [
                    order.orderId.length > 8 ? order.orderId.substring(0, 8) + '...' : order.orderId,
                    order.date,
                    order.customer.length > 10 ? order.customer.substring(0, 10) + '...' : order.customer,
                    order.paymentMethod.length > 7 ? order.paymentMethod.substring(0, 7) + '...' : order.paymentMethod,
                    order.status.length > 7 ? order.status.substring(0, 7) + '...' : order.status,
                    `₹${order.amount.toLocaleString('en-IN')}`,
                    `₹${order.discount.toLocaleString('en-IN')}`,
                    `₹${order.finalAmount.toLocaleString('en-IN')}`
                ];
                
                orderRowData.forEach((data, i) => {
                    const align = i < 3 ? 'left' : 'center';
                    doc.fillColor('#333333').text(data, orderColX[i], orderRowY, { 
                        width: orderColWidths[i], 
                        align: align 
                    });
                });
                
                doc.y = orderRowY + 10;
                
                // Add line separator every 6 rows
                if ((index + 1) % 6 === 0 && index < maxOrdersToShow - 1) {
                    doc.strokeColor('#e0e0e0').lineWidth(0.5)
                       .moveTo(leftMargin, doc.y + 1)
                       .lineTo(leftMargin + usableWidth - 40, doc.y + 1)
                       .stroke();
                    doc.y += 3;
                }
            });

            // Show note if more orders exist
            if (orders.length > maxOrdersToShow) {
                doc.moveDown(0.5);
                doc.fontSize(8).fillColor('#666666');
                doc.text(`Note: Showing first ${maxOrdersToShow} orders. Total: ${orders.length}`, { align: 'center' });
            }

            // Footer
            doc.fontSize(8).fillColor('#666666');
            doc.text(`ArvenClaire Sales Report - Generated on ${new Date().toLocaleDateString('en-GB')}`, 40, 770, { align: 'center' });
            doc.text('* All amounts in Indian Rupees (₹). Discounts include product offers and coupon discounts for active items only.', 40, 780, { align: 'center' });

            // Finalize the PDF
            doc.end();

        } catch (error) {
            console.error('Error exporting PDF:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export PDF: ' + error.message
            });
        }
    },

    // Export Sales Report as Excel
    exportExcel: async (req, res) => {
        try {
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            // Create a new workbook
            const workbook = new ExcelJS.Workbook();
            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `ArvenClaire-Comprehensive-Sales-Report-${currentDate}.xlsx`;

            // Set workbook properties
            workbook.creator = 'ArvenClaire Sales System';
            workbook.lastModifiedBy = 'ArvenClaire Sales System';
            workbook.created = new Date();
            workbook.modified = new Date();

            // 1. EXECUTIVE SUMMARY SHEET
            const summarySheet = workbook.addWorksheet('Executive Summary');
            
            // Company Header
            summarySheet.mergeCells('A1:H1');
            summarySheet.getCell('A1').value = 'ARVENCLAIRE - COMPREHENSIVE SALES REPORT';
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

            // Key Performance Indicators
            summarySheet.getCell('A5').value = 'KEY PERFORMANCE INDICATORS';
            summarySheet.getCell('A5').font = { size: 14, bold: true, color: { argb: 'FF2E75B6' } };
            summarySheet.mergeCells('A5:H5');
            summarySheet.getCell('A5').alignment = { horizontal: 'center' };

            // KPI Table Headers
            const kpiHeaders = ['Metric', 'Value', 'Description'];
            kpiHeaders.forEach((header, index) => {
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

            // KPI Data
            const kpiData = [
                ['Total Revenue', `₹${salesStats.totalRevenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Gross revenue from all orders'],
                ['Net Revenue', `₹${salesStats.netRevenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Revenue after all discounts'],
                ['Total Orders', salesStats.totalOrders.toLocaleString('en-IN'), 'Number of orders processed'],
                ['Average Order Value', `₹${salesStats.averageOrder.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Average value per order'],
                ['Total Discounts', `₹${salesStats.totalDiscount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Total discounts applied'],
                ['Discount Percentage', `${((salesStats.totalDiscount / salesStats.totalRevenue) * 100).toFixed(2)}%`, 'Percentage of revenue discounted'],
                ['Revenue Growth Rate', 'N/A', 'Compared to previous period'],
                ['Customer Acquisition', 'N/A', 'New customers in period']
            ];

            kpiData.forEach((row, index) => {
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

            // 2. DETAILED ORDERS SHEET
            const ordersSheet = workbook.addWorksheet('Detailed Orders');
            
            // Headers
            ordersSheet.getCell('A1').value = 'DETAILED ORDER ANALYSIS';
            ordersSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            ordersSheet.mergeCells('A1:L1');
            ordersSheet.getCell('A1').alignment = { horizontal: 'center' };

            ordersSheet.getCell('A2').value = `Total Orders: ${orders.length}`;
            ordersSheet.getCell('A2').font = { size: 12, bold: true };

            // Order table headers
            const orderHeaders = [
                'Order ID', 'Date', 'Customer Name', 'Email', 'Phone', 'Gender', 
                'Date of Birth', 'Join Date', 'Customer Status', 'Payment Method', 
                'Order Status', 'Items Count', 'Gross Amount', 'Discount Applied', 
                'Final Amount', 'Profit Margin', 'Notes'
            ];
            
            orderHeaders.forEach((header, index) => {
                const cell = ordersSheet.getCell(4, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Get detailed order data with additional information
            const detailedOrders = await Promise.all(orders.map(async (order) => {
                // Get the full order details from database
                const fullOrder = await Order.findOne({ orderId: order.orderId })
                    .populate({
                        path: 'userId',
                        select: 'fullname email phone dateOfBirth gender addresses createdAt isBlocked'
                    })
                    .populate('orderedItems.product', 'productName regularPrice salePrice');
                
                const itemsCount = fullOrder ? fullOrder.orderedItems.length : 0;
                const customerEmail = fullOrder && fullOrder.userId ? fullOrder.userId.email : 'N/A';
                const customerPhone = fullOrder && fullOrder.userId ? fullOrder.userId.phone : 'N/A';
                const customerGender = fullOrder && fullOrder.userId ? fullOrder.userId.gender : 'N/A';
                const customerDOB = fullOrder && fullOrder.userId && fullOrder.userId.dateOfBirth ? 
                    new Date(fullOrder.userId.dateOfBirth).toLocaleDateString('en-GB') : 'N/A';
                const customerJoinDate = fullOrder && fullOrder.userId && fullOrder.userId.createdAt ? 
                    new Date(fullOrder.userId.createdAt).toLocaleDateString('en-GB') : 'N/A';
                const customerStatus = fullOrder && fullOrder.userId ? 
                    (fullOrder.userId.isBlocked ? 'Blocked' : 'Active') : 'N/A';
                const profitMargin = order.finalAmount > 0 ? ((order.finalAmount - (order.finalAmount * 0.3)) / order.finalAmount * 100).toFixed(2) + '%' : '0%';
                
                return {
                    ...order,
                    itemsCount,
                    customerEmail,
                    customerPhone,
                    customerGender,
                    customerDOB,
                    customerJoinDate,
                    customerStatus,
                    customerContact: customerEmail !== 'N/A' ? customerEmail : customerPhone,
                    profitMargin,
                    notes: fullOrder && fullOrder.status ? `Status: ${fullOrder.status}` : '',
                    fullUserData: fullOrder ? fullOrder.userId : null
                };
            }));

            // Add order data
            detailedOrders.forEach((order, index) => {
                const row = index + 5;
                const orderData = [
                    order.orderId,
                    order.date,
                    order.customer,
                    order.customerEmail,
                    order.customerPhone,
                    order.customerGender,
                    order.customerDOB,
                    order.customerJoinDate,
                    order.customerStatus,
                    order.paymentMethod,
                    order.status,
                    order.itemsCount,
                    order.amount,
                    order.discount,
                    order.finalAmount,
                    order.profitMargin,
                    order.notes
                ];
                
                orderData.forEach((value, colIndex) => {
                    const cell = ordersSheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 12 && colIndex <= 14) {
                        // Format currency columns (adjusted for new column positions)
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
                    
                    // Customer Status color coding
                    if (colIndex === 8) { // Customer Status
                        if (value && value.toLowerCase().includes('active')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('blocked')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        }
                    }
                    
                    // Order Status color coding
                    if (colIndex === 10) { // Order Status (adjusted position)
                        if (value && value.toLowerCase().includes('delivered')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('cancelled')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('pending')) {
                            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                        }
                    }
                });
            });

            // Set column widths for orders
            ordersSheet.columns = [
                { width: 15 }, { width: 12 }, { width: 20 }, { width: 25 }, { width: 15 },
                { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 },
                { width: 12 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 },
                { width: 12 }, { width: 30 }
            ];

            // 3. DAILY ANALYSIS SHEET
            const dailySheet = workbook.addWorksheet('Daily Analysis');
            
            dailySheet.getCell('A1').value = 'DAILY SALES PERFORMANCE';
            dailySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            dailySheet.mergeCells('A1:G1');
            dailySheet.getCell('A1').alignment = { horizontal: 'center' };

            const dailyHeaders = ['Date', 'Orders Count', 'Gross Revenue', 'Discounts', 'Net Revenue', 'Avg Order Value', 'Growth %'];
            dailyHeaders.forEach((header, index) => {
                const cell = dailySheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Add daily analysis data with calculations
            dailyAnalysis.forEach((item, index) => {
                const row = index + 4;
                const avgOrderValue = item.orders > 0 ? item.netRevenue / item.orders : 0;
                const prevDayRevenue = index > 0 ? dailyAnalysis[index - 1].netRevenue : item.netRevenue;
                const growthRate = prevDayRevenue > 0 ? ((item.netRevenue - prevDayRevenue) / prevDayRevenue * 100).toFixed(2) + '%' : '0%';
                
                const dailyData = [
                    item.date,
                    item.orders,
                    item.revenue,
                    item.discount,
                    item.netRevenue,
                    avgOrderValue,
                    growthRate
                ];
                
                dailyData.forEach((value, colIndex) => {
                    const cell = dailySheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 2 && colIndex <= 5) {
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
                });
            });

            // Add totals row for daily analysis
            const totalRow = dailyAnalysis.length + 4;
            const totalData = [
                'TOTAL',
                salesStats.totalOrders,
                salesStats.totalRevenue,
                salesStats.totalDiscount,
                salesStats.netRevenue,
                salesStats.averageOrder,
                'N/A'
            ];
            
            totalData.forEach((value, colIndex) => {
                const cell = dailySheet.getCell(totalRow, colIndex + 1);
                
                if (typeof value === 'number' && colIndex >= 2 && colIndex <= 5) {
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

            dailySheet.columns = [
                { width: 15 }, { width: 12 }, { width: 15 }, { width: 15 },
                { width: 15 }, { width: 15 }, { width: 12 }
            ];

            // 4. PAYMENT ANALYSIS SHEET
            const paymentSheet = workbook.addWorksheet('Payment Analysis');
            
            paymentSheet.getCell('A1').value = 'PAYMENT METHOD ANALYSIS';
            paymentSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            paymentSheet.mergeCells('A1:E1');
            paymentSheet.getCell('A1').alignment = { horizontal: 'center' };

            // Calculate payment method statistics
            const paymentStats = {};
            orders.forEach(order => {
                const method = order.paymentMethod || 'Unknown';
                if (!paymentStats[method]) {
                    paymentStats[method] = { count: 0, revenue: 0, discount: 0, netRevenue: 0 };
                }
                paymentStats[method].count++;
                paymentStats[method].revenue += order.amount;
                paymentStats[method].discount += order.discount;
                paymentStats[method].netRevenue += order.finalAmount;
            });

            const paymentHeaders = ['Payment Method', 'Order Count', 'Total Revenue', 'Total Discount', 'Net Revenue'];
            paymentHeaders.forEach((header, index) => {
                const cell = paymentSheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            let paymentRowIndex = 4;
            Object.entries(paymentStats).forEach(([method, stats]) => {
                const paymentData = [method, stats.count, stats.revenue, stats.discount, stats.netRevenue];
                paymentData.forEach((value, colIndex) => {
                    const cell = paymentSheet.getCell(paymentRowIndex, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 2) {
                        cell.value = value;
                        cell.numFmt = '₹#,##0.00';
                    } else {
                        cell.value = value;
                    }
                    
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                });
                paymentRowIndex++;
            });

            paymentSheet.columns = [
                { width: 20 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 18 }
            ];

            // 5. PRODUCT SALES DETAILS SHEET
            const productDetailsSheet = workbook.addWorksheet('Product Sales Details');
            
            productDetailsSheet.getCell('A1').value = 'DETAILED PRODUCT SALES BREAKDOWN';
            productDetailsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            productDetailsSheet.mergeCells('A1:O1');
            productDetailsSheet.getCell('A1').alignment = { horizontal: 'center' };

            // Get detailed product sales data
            const productSalesData = [];
            
            for (const order of orders) {
                // Get the full order details from database with product information
                const fullOrder = await Order.findOne({ orderId: order.orderId })
                    .populate({
                        path: 'userId',
                        select: 'fullname email phone dateOfBirth gender addresses createdAt isBlocked'
                    })
                    .populate({
                        path: 'orderedItems.product',
                        select: 'productName regularPrice salePrice category brand productOffer images'
                    });
                
                if (fullOrder && fullOrder.orderedItems) {
                    for (const item of fullOrder.orderedItems) {
                        if (item.product) {
                            const productData = {
                                orderId: order.orderId,
                                orderDate: order.date,
                                customerName: order.customer,
                                customerEmail: fullOrder.userId ? fullOrder.userId.email : 'N/A',
                                customerPhone: fullOrder.userId ? fullOrder.userId.phone : 'N/A',
                                customerGender: fullOrder.userId ? fullOrder.userId.gender : 'N/A',
                                customerDOB: fullOrder.userId && fullOrder.userId.dateOfBirth ? 
                                    new Date(fullOrder.userId.dateOfBirth).toLocaleDateString('en-GB') : 'N/A',
                                customerJoinDate: fullOrder.userId && fullOrder.userId.createdAt ? 
                                    new Date(fullOrder.userId.createdAt).toLocaleDateString('en-GB') : 'N/A',
                                customerStatus: fullOrder.userId ? 
                                    (fullOrder.userId.isBlocked ? 'Blocked' : 'Active') : 'N/A',
                                productName: item.product.productName || 'N/A',
                                category: item.product.category || 'N/A',
                                brand: item.product.brand || 'N/A',
                                quantity: item.quantity || 0,
                                unitRegularPrice: item.product.regularPrice || 0,
                                unitSalePrice: item.product.salePrice || item.product.regularPrice || 0,
                                totalRegularPrice: (item.product.regularPrice || 0) * (item.quantity || 0),
                                totalSalePrice: (item.product.salePrice || item.product.regularPrice || 0) * (item.quantity || 0),
                                itemFinalPrice: item.totalPrice || 0,
                                itemDiscount: Math.max(0, ((item.product.regularPrice || 0) * (item.quantity || 0)) - (item.totalPrice || 0)),
                                itemStatus: item.status || 'Unknown',
                                paymentMethod: order.paymentMethod,
                                orderStatus: order.status,
                                productOffer: item.product.productOffer || 0,
                                discountPercentage: item.product.regularPrice > 0 ? 
                                    (((item.product.regularPrice - (item.totalPrice / item.quantity)) / item.product.regularPrice) * 100).toFixed(2) + '%' : '0%'
                            };
                            productSalesData.push(productData);
                        }
                    }
                }
            }

            // Product details headers
            const productHeaders = [
                'Order ID', 'Order Date', 'Customer Name', 'Customer Email', 'Customer Phone',
                'Gender', 'Date of Birth', 'Join Date', 'Customer Status', 'Product Name',
                'Category', 'Brand', 'Quantity', 'Unit Regular Price', 'Unit Sale Price',
                'Total Regular Price', 'Total Sale Price', 'Final Item Price', 'Item Discount',
                'Discount %', 'Item Status', 'Payment Method', 'Order Status', 'Product Offer'
            ];
            
            productHeaders.forEach((header, index) => {
                const cell = productDetailsSheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Add product sales data
            productSalesData.forEach((product, index) => {
                const row = index + 4;
                const productRowData = [
                    product.orderId,
                    product.orderDate,
                    product.customerName,
                    product.customerEmail,
                    product.customerPhone,
                    product.customerGender,
                    product.customerDOB,
                    product.customerJoinDate,
                    product.customerStatus,
                    product.productName,
                    product.category,
                    product.brand,
                    product.quantity,
                    product.unitRegularPrice,
                    product.unitSalePrice,
                    product.totalRegularPrice,
                    product.totalSalePrice,
                    product.itemFinalPrice,
                    product.itemDiscount,
                    product.discountPercentage,
                    product.itemStatus,
                    product.paymentMethod,
                    product.orderStatus,
                    product.productOffer
                ];
                
                productRowData.forEach((value, colIndex) => {
                    const cell = productDetailsSheet.getCell(row, colIndex + 1);
                    
                    // Format currency columns (adjusted for new column positions)
                    if (typeof value === 'number' && colIndex >= 13 && colIndex <= 18) {
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
                    
                    // Customer Status color coding
                    if (colIndex === 8) { // Customer Status
                        if (value && value.toLowerCase().includes('active')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('blocked')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        }
                    }
                    
                    // Item Status color coding
                    if (colIndex === 20) { // Item Status (adjusted position)
                        if (value && value.toLowerCase().includes('active')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('cancelled')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('returned')) {
                            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                        }
                    }
                    
                    // Order Status color coding
                    if (colIndex === 22) { // Order Status (adjusted position)
                        if (value && value.toLowerCase().includes('delivered')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('cancelled')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('pending')) {
                            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                        }
                    }
                });
            });

            // Set column widths for product details
            productDetailsSheet.columns = [
                { width: 15 }, { width: 12 }, { width: 20 }, { width: 25 }, { width: 15 },
                { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 30 },
                { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 },
                { width: 18 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 12 },
                { width: 12 }, { width: 15 }, { width: 12 }, { width: 12 }
            ];

            // Add summary row for product details
            const productSummaryRow = productSalesData.length + 5;
            productDetailsSheet.getCell(productSummaryRow, 1).value = 'SUMMARY';
            productDetailsSheet.getCell(productSummaryRow, 1).font = { bold: true, size: 12 };
            productDetailsSheet.getCell(productSummaryRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };

            // Calculate totals
            const totalQuantity = productSalesData.reduce((sum, item) => sum + item.quantity, 0);
            const totalRegularAmount = productSalesData.reduce((sum, item) => sum + item.totalRegularPrice, 0);
            const totalSaleAmount = productSalesData.reduce((sum, item) => sum + item.totalSalePrice, 0);
            const totalFinalAmount = productSalesData.reduce((sum, item) => sum + item.itemFinalPrice, 0);
            const totalDiscountAmount = productSalesData.reduce((sum, item) => sum + item.itemDiscount, 0);

            productDetailsSheet.getCell(productSummaryRow, 7).value = 'Total Items:';
            productDetailsSheet.getCell(productSummaryRow, 7).font = { bold: true };
            productDetailsSheet.getCell(productSummaryRow, 8).value = totalQuantity;
            productDetailsSheet.getCell(productSummaryRow, 8).font = { bold: true };

            productDetailsSheet.getCell(productSummaryRow, 11).value = totalRegularAmount;
            productDetailsSheet.getCell(productSummaryRow, 11).numFmt = '₹#,##0.00';
            productDetailsSheet.getCell(productSummaryRow, 11).font = { bold: true };

            productDetailsSheet.getCell(productSummaryRow, 12).value = totalSaleAmount;
            productDetailsSheet.getCell(productSummaryRow, 12).numFmt = '₹#,##0.00';
            productDetailsSheet.getCell(productSummaryRow, 12).font = { bold: true };

            productDetailsSheet.getCell(productSummaryRow, 13).value = totalFinalAmount;
            productDetailsSheet.getCell(productSummaryRow, 13).numFmt = '₹#,##0.00';
            productDetailsSheet.getCell(productSummaryRow, 13).font = { bold: true };

            productDetailsSheet.getCell(productSummaryRow, 14).value = totalDiscountAmount;
            productDetailsSheet.getCell(productSummaryRow, 14).numFmt = '₹#,##0.00';
            productDetailsSheet.getCell(productSummaryRow, 14).font = { bold: true };

            // 6. PRODUCT PERFORMANCE ANALYSIS SHEET
            const productAnalysisSheet = workbook.addWorksheet('Product Performance');
            
            productAnalysisSheet.getCell('A1').value = 'PRODUCT PERFORMANCE ANALYSIS';
            productAnalysisSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            productAnalysisSheet.mergeCells('A1:H1');
            productAnalysisSheet.getCell('A1').alignment = { horizontal: 'center' };

            // Calculate product performance statistics
            const productPerformance = {};
            productSalesData.forEach(item => {
                const productKey = item.productName;
                if (!productPerformance[productKey]) {
                    productPerformance[productKey] = {
                        productName: item.productName,
                        category: item.category,
                        brand: item.brand,
                        totalQuantitySold: 0,
                        totalRevenue: 0,
                        totalDiscount: 0,
                        orderCount: 0,
                        avgSellingPrice: 0
                    };
                }
                
                productPerformance[productKey].totalQuantitySold += item.quantity;
                productPerformance[productKey].totalRevenue += item.itemFinalPrice;
                productPerformance[productKey].totalDiscount += item.itemDiscount;
                productPerformance[productKey].orderCount += 1;
            });

            // Calculate average selling price
            Object.values(productPerformance).forEach(product => {
                product.avgSellingPrice = product.totalQuantitySold > 0 ? 
                    product.totalRevenue / product.totalQuantitySold : 0;
            });

            // Sort by total revenue (best performing first)
            const sortedProducts = Object.values(productPerformance)
                .sort((a, b) => b.totalRevenue - a.totalRevenue);

            // Product performance headers
            const performanceHeaders = [
                'Product Name', 'Category', 'Brand', 'Qty Sold', 
                'Total Revenue', 'Total Discount', 'Orders', 'Avg Price/Unit'
            ];
            
            performanceHeaders.forEach((header, index) => {
                const cell = productAnalysisSheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Add product performance data
            sortedProducts.forEach((product, index) => {
                const row = index + 4;
                const performanceData = [
                    product.productName,
                    product.category,
                    product.brand,
                    product.totalQuantitySold,
                    product.totalRevenue,
                    product.totalDiscount,
                    product.orderCount,
                    product.avgSellingPrice
                ];
                
                performanceData.forEach((value, colIndex) => {
                    const cell = productAnalysisSheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 4) {
                        cell.value = value;
                        cell.numFmt = '₹#,##0.00';
                    } else if (typeof value === 'number') {
                        cell.value = value;
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
                    
                    // Highlight top performers
                    if (index < 5) {
                        cell.font = { bold: true };
                    }
                });
            });

            productAnalysisSheet.columns = [
                { width: 30 }, { width: 15 }, { width: 15 }, { width: 10 },
                { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }
            ];

            // 7. CUSTOMER ANALYSIS SHEET
            const customerAnalysisSheet = workbook.addWorksheet('Customer Analysis');
            
            customerAnalysisSheet.getCell('A1').value = 'COMPREHENSIVE CUSTOMER ANALYSIS';
            customerAnalysisSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            customerAnalysisSheet.mergeCells('A1:L1');
            customerAnalysisSheet.getCell('A1').alignment = { horizontal: 'center' };

            // Calculate customer statistics
            const customerStats = {};
            detailedOrders.forEach(order => {
                const customerKey = order.customerEmail !== 'N/A' ? order.customerEmail : order.customer;
                if (!customerStats[customerKey]) {
                    customerStats[customerKey] = {
                        customerName: order.customer,
                        customerEmail: order.customerEmail,
                        customerPhone: order.customerPhone,
                        customerGender: order.customerGender,
                        customerDOB: order.customerDOB,
                        customerJoinDate: order.customerJoinDate,
                        customerStatus: order.customerStatus,
                        totalOrders: 0,
                        totalSpent: 0,
                        totalDiscount: 0,
                        avgOrderValue: 0,
                        lastOrderDate: order.date,
                        firstOrderDate: order.date
                    };
                }
                
                customerStats[customerKey].totalOrders += 1;
                customerStats[customerKey].totalSpent += order.finalAmount;
                customerStats[customerKey].totalDiscount += order.discount;
                
                // Update first and last order dates
                if (new Date(order.date) > new Date(customerStats[customerKey].lastOrderDate)) {
                    customerStats[customerKey].lastOrderDate = order.date;
                }
                if (new Date(order.date) < new Date(customerStats[customerKey].firstOrderDate)) {
                    customerStats[customerKey].firstOrderDate = order.date;
                }
            });

            // Calculate average order value for each customer
            Object.values(customerStats).forEach(customer => {
                customer.avgOrderValue = customer.totalOrders > 0 ? 
                    customer.totalSpent / customer.totalOrders : 0;
            });

            // Sort by total spent (best customers first)
            const sortedCustomers = Object.values(customerStats)
                .sort((a, b) => b.totalSpent - a.totalSpent);

            // Customer analysis headers
            const customerHeaders = [
                'Customer Name', 'Email', 'Phone', 'Gender', 'Date of Birth', 'Join Date',
                'Status', 'Total Orders', 'Total Spent', 'Total Discount', 'Avg Order Value',
                'First Order', 'Last Order'
            ];
            
            customerHeaders.forEach((header, index) => {
                const cell = customerAnalysisSheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Add customer analysis data
            sortedCustomers.forEach((customer, index) => {
                const row = index + 4;
                const customerData = [
                    customer.customerName,
                    customer.customerEmail,
                    customer.customerPhone,
                    customer.customerGender,
                    customer.customerDOB,
                    customer.customerJoinDate,
                    customer.customerStatus,
                    customer.totalOrders,
                    customer.totalSpent,
                    customer.totalDiscount,
                    customer.avgOrderValue,
                    customer.firstOrderDate,
                    customer.lastOrderDate
                ];
                
                customerData.forEach((value, colIndex) => {
                    const cell = customerAnalysisSheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 8 && colIndex <= 10) {
                        cell.value = value;
                        cell.numFmt = '₹#,##0.00';
                    } else if (typeof value === 'number') {
                        cell.value = value;
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
                    
                    // Customer Status color coding
                    if (colIndex === 6) {
                        if (value && value.toLowerCase().includes('active')) {
                            cell.font = { color: { argb: 'FF008000' }, bold: true };
                        } else if (value && value.toLowerCase().includes('blocked')) {
                            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                        }
                    }
                    
                    // Highlight top customers (top 10)
                    if (index < 10) {
                        if (colIndex === 8 || colIndex === 7) { // Total Spent or Total Orders
                            cell.font = { bold: true, color: { argb: 'FF2E75B6' } };
                        }
                    }
                });
            });

            // Add customer summary
            const customerSummaryRow = sortedCustomers.length + 5;
            customerAnalysisSheet.getCell(customerSummaryRow, 1).value = 'CUSTOMER SUMMARY';
            customerAnalysisSheet.getCell(customerSummaryRow, 1).font = { bold: true, size: 12 };
            customerAnalysisSheet.getCell(customerSummaryRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };

            const totalCustomers = sortedCustomers.length;
            const totalCustomerSpent = sortedCustomers.reduce((sum, customer) => sum + customer.totalSpent, 0);
            const totalCustomerOrders = sortedCustomers.reduce((sum, customer) => sum + customer.totalOrders, 0);
            const avgCustomerValue = totalCustomers > 0 ? totalCustomerSpent / totalCustomers : 0;

            customerAnalysisSheet.getCell(customerSummaryRow, 7).value = 'Total Customers:';
            customerAnalysisSheet.getCell(customerSummaryRow, 7).font = { bold: true };
            customerAnalysisSheet.getCell(customerSummaryRow, 8).value = totalCustomers;
            customerAnalysisSheet.getCell(customerSummaryRow, 8).font = { bold: true };

            customerAnalysisSheet.getCell(customerSummaryRow, 9).value = totalCustomerSpent;
            customerAnalysisSheet.getCell(customerSummaryRow, 9).numFmt = '₹#,##0.00';
            customerAnalysisSheet.getCell(customerSummaryRow, 9).font = { bold: true };

            customerAnalysisSheet.getCell(customerSummaryRow, 11).value = avgCustomerValue;
            customerAnalysisSheet.getCell(customerSummaryRow, 11).numFmt = '₹#,##0.00';
            customerAnalysisSheet.getCell(customerSummaryRow, 11).font = { bold: true };

            customerAnalysisSheet.columns = [
                { width: 20 }, { width: 25 }, { width: 15 }, { width: 10 }, { width: 12 },
                { width: 12 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 15 },
                { width: 15 }, { width: 12 }, { width: 12 }
            ];

            // Set response headers for Excel download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Write to response
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error exporting Excel:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export Excel: ' + error.message
            });
        }
    }
};




module.exports = salesReportController;