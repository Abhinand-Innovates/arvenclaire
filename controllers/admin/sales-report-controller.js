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
            orderStatus = 'all'
        } = filters;

        // Calculate date range based on time period
        const now = new Date();
        let startDate;
        
        switch (timePeriod) {
            case 'weekly':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'yearly':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
        }

        // Build query filters
        const matchQuery = {
            createdAt: { $gte: startDate, $lte: now }
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

        // Format data with correct calculations
        const formattedOrders = await Promise.all(orders.map(async (order) => {
            // Calculate regular price total (before any discounts)
            let regularPriceTotal = 0;
            let totalDiscountAmount = 0;
            
            // Check if order is cancelled - if so, no discounts should be applied
            const isCancelled = order.status && order.status.toLowerCase().includes('cancelled');
            
            // Populate product details for each ordered item to get regular prices
            await order.populate({
                path: 'orderedItems.product',
                select: 'regularPrice salePrice productOffer'
            });
            
            // Calculate totals based on regular prices and actual discounts
            for (const item of order.orderedItems) {
                if (item.product && item.status === 'Active') {
                    const regularPrice = item.product.regularPrice || 0;
                    const quantity = item.quantity || 0;
                    const itemRegularTotal = regularPrice * quantity;
                    const itemFinalTotal = item.totalPrice || 0;
                    
                    regularPriceTotal += itemRegularTotal;
                    
                    // Only calculate discount if order is not cancelled
                    if (!isCancelled) {
                        // Calculate discount for this item (difference between regular price total and final total)
                        totalDiscountAmount += Math.max(0, itemRegularTotal - itemFinalTotal);
                    }
                }
            }
            
            // Add coupon discount to total discount only if order is not cancelled
            if (!isCancelled) {
                const couponDiscount = order.couponDiscount || 0;
                totalDiscountAmount += couponDiscount;
            }
            
            // Final amount should be regular price total minus total discounts
            const finalAmount = regularPriceTotal - totalDiscountAmount;
            
            return {
                orderId: order.orderId || 'N/A',
                date: order.createdAt ? order.createdAt.toLocaleDateString('en-GB') : 'N/A',
                customer: order.userId ? order.userId.fullname : 'Guest',
                paymentMethod: order.paymentMethod || 'N/A',
                status: order.status || 'Pending',
                amount: regularPriceTotal, // Total of regular prices (before discounts)
                discount: totalDiscountAmount, // Total discount (product offers + coupon) - zero if cancelled
                finalAmount: finalAmount // Net amount after discounts
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
            totalRevenue: totalRegularPriceRevenue, // Total of Amount column (sum of "Amount" column from Order Details)
            totalOrders: formattedOrders.length,
            totalDiscount: totalDiscountAmount, // Total discount amount
            averageOrder: formattedOrders.length > 0 ? totalFinalAmount / formattedOrders.length : 0,
            netRevenue: totalFinalAmount, // Total of Final Amount column (sum of "Final Amount" column from Order Details)
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
            dayData.revenue += order.amount; // Regular price total
            dayData.discount += order.discount; // Total discount
            dayData.netRevenue += order.finalAmount; // Final amount
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
            console.log('Sales Report called with query:', req.query);
            // Get filter parameters from query
            const { 
                timePeriod = 'monthly', 
                paymentMethod = 'all', 
                orderStatus = 'all',
                page = 1,
                limit = 10
            } = req.query;

            // Get filtered data using helper function
            const { orders: allOrders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData({
                timePeriod,
                paymentMethod,
                orderStatus
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
                    orderStatus
                }
            });

        } catch (error) {
            console.error('Error fetching sales report:', error);
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
            console.log('PDF Export called with filters:', req.query);
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            // Create a new PDF document
            const doc = new PDFDocument({ margin: 50 });
            const filename = `sales-report-${new Date().toISOString().split('T')[0]}.pdf`;

            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Pipe the PDF to the response
            doc.pipe(res);

            // Add header
            doc.fontSize(20).text('Sales Report', { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, { align: 'center' });
            doc.text(`Period: ${filters.timePeriod || 'Monthly'} | Payment: ${filters.paymentMethod || 'All'} | Status: ${filters.orderStatus || 'All'}`, { align: 'center' });
            doc.moveDown(2);

            // Add statistics section
            doc.fontSize(16).text('Summary Statistics', { underline: true });
            doc.moveDown();
            doc.fontSize(12);
            doc.text(`Total Revenue (Amount): ₹${salesStats.totalRevenue.toLocaleString('en-IN')}`);
            doc.text(`Net Revenue (Final Amount): ₹${salesStats.netRevenue.toLocaleString('en-IN')}`);
            doc.text(`Total Orders: ${salesStats.totalOrders}`);
            doc.text(`Average Order Value: ₹${salesStats.averageOrder.toLocaleString('en-IN')}`);
            doc.text(`Total Discount: ₹${salesStats.totalDiscount.toLocaleString('en-IN')}`);
            doc.moveDown(2);

            // Add daily analysis section
            doc.fontSize(16).text('Daily Analysis', { underline: true });
            doc.moveDown();

            // Create table for daily analysis
            const dailyTableTop = doc.y;
            const dailyTableLeft = 50;
            const dailyColWidths = [80, 60, 80, 80, 80];
            const dailyHeaders = ['Date', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];

            // Draw daily analysis table headers
            doc.fontSize(10);
            let currentX = dailyTableLeft;
            dailyHeaders.forEach((header, i) => {
                doc.text(header, currentX, dailyTableTop, { width: dailyColWidths[i], align: 'center' });
                currentX += dailyColWidths[i];
            });

            // Draw daily analysis table rows
            let currentY = dailyTableTop + 20;
            dailyAnalysis.slice(0, 10).forEach((item) => {
                currentX = dailyTableLeft;
                const rowData = [
                    item.date,
                    item.orders.toString(),
                    `₹${item.revenue.toLocaleString('en-IN')}`,
                    `₹${item.discount.toLocaleString('en-IN')}`,
                    `₹${item.netRevenue.toLocaleString('en-IN')}`
                ];
                
                rowData.forEach((data, i) => {
                    doc.text(data, currentX, currentY, { width: dailyColWidths[i], align: 'center' });
                    currentX += dailyColWidths[i];
                });
                currentY += 15;
            });

            doc.y = currentY + 20;
            doc.moveDown();

            // Add order details section
            doc.fontSize(16).text('Order Details', { underline: true });
            doc.moveDown();

            // Create table for orders (limit to first 20 orders to avoid PDF size issues)
            const orderTableTop = doc.y;
            const orderTableLeft = 50;
            const orderColWidths = [60, 60, 80, 70, 60, 60, 50, 60];
            const orderHeaders = ['Order ID', 'Date', 'Customer', 'Payment', 'Status', 'Amount', 'Discount', 'Final'];

            // Draw order table headers
            doc.fontSize(8);
            currentX = orderTableLeft;
            orderHeaders.forEach((header, i) => {
                doc.text(header, currentX, orderTableTop, { width: orderColWidths[i], align: 'center' });
                currentX += orderColWidths[i];
            });

            // Draw order table rows (limit to 20 orders)
            currentY = orderTableTop + 15;
            orders.slice(0, 20).forEach((order) => {
                // Check if we need a new page
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }

                currentX = orderTableLeft;
                const orderRowData = [
                    order.orderId.substring(0, 8) + '...',
                    order.date,
                    order.customer.substring(0, 12) + (order.customer.length > 12 ? '...' : ''),
                    order.paymentMethod.substring(0, 8) + (order.paymentMethod.length > 8 ? '...' : ''),
                    order.status,
                    `₹${order.amount.toLocaleString('en-IN')}`,
                    `₹${order.discount.toLocaleString('en-IN')}`,
                    `₹${order.finalAmount.toLocaleString('en-IN')}`
                ];
                
                orderRowData.forEach((data, i) => {
                    doc.text(data, currentX, currentY, { width: orderColWidths[i], align: 'center' });
                    currentX += orderColWidths[i];
                });
                currentY += 12;
            });

            if (orders.length > 20) {
                doc.moveDown();
                doc.fontSize(10).text(`Note: Showing first 20 orders out of ${orders.length} total orders.`, { align: 'center', color: 'gray' });
            }

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
            console.log('Excel Export called with filters:', req.query);
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            // Create a new workbook
            const workbook = new ExcelJS.Workbook();
            const filename = `sales-report-${new Date().toISOString().split('T')[0]}.xlsx`;

            // Create Summary worksheet
            const summarySheet = workbook.addWorksheet('Summary');
            
            // Add title and metadata
            summarySheet.mergeCells('A1:E1');
            summarySheet.getCell('A1').value = 'Sales Report';
            summarySheet.getCell('A1').font = { size: 16, bold: true };
            summarySheet.getCell('A1').alignment = { horizontal: 'center' };

            summarySheet.mergeCells('A2:E2');
            summarySheet.getCell('A2').value = `Generated on: ${new Date().toLocaleDateString('en-GB')}`;
            summarySheet.getCell('A2').alignment = { horizontal: 'center' };

            summarySheet.mergeCells('A3:E3');
            summarySheet.getCell('A3').value = `Period: ${filters.timePeriod || 'Monthly'} | Payment: ${filters.paymentMethod || 'All'} | Status: ${filters.orderStatus || 'All'}`;
            summarySheet.getCell('A3').alignment = { horizontal: 'center' };

            // Add statistics section
            summarySheet.getCell('A5').value = 'Summary Statistics';
            summarySheet.getCell('A5').font = { bold: true, size: 14 };
            
            summarySheet.getCell('A6').value = 'Metric';
            summarySheet.getCell('B6').value = 'Value';
            summarySheet.getRow(6).font = { bold: true };

            summarySheet.getCell('A7').value = 'Total Revenue (Amount)';
            summarySheet.getCell('B7').value = `₹${salesStats.totalRevenue.toLocaleString('en-IN')}`;
            
            summarySheet.getCell('A8').value = 'Net Revenue (Final Amount)';
            summarySheet.getCell('B8').value = `₹${salesStats.netRevenue.toLocaleString('en-IN')}`;
            
            summarySheet.getCell('A9').value = 'Total Orders';
            summarySheet.getCell('B9').value = salesStats.totalOrders;
            
            summarySheet.getCell('A10').value = 'Average Order Value';
            summarySheet.getCell('B10').value = `₹${salesStats.averageOrder.toLocaleString('en-IN')}`;
            
            summarySheet.getCell('A11').value = 'Total Discount';
            summarySheet.getCell('B11').value = `₹${salesStats.totalDiscount.toLocaleString('en-IN')}`;

            // Style the summary sheet
            summarySheet.columns = [
                { width: 20 },
                { width: 20 },
                { width: 15 },
                { width: 15 },
                { width: 15 }
            ];

            // Create Daily Analysis worksheet
            const dailySheet = workbook.addWorksheet('Daily Analysis');
            
            // Add headers
            dailySheet.getCell('A1').value = 'Daily Analysis';
            dailySheet.getCell('A1').font = { bold: true, size: 14 };
            
            const dailyHeaders = ['Date', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];
            dailyHeaders.forEach((header, index) => {
                const cell = dailySheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
            });

            // Add daily analysis data
            dailyAnalysis.forEach((item, index) => {
                const row = index + 4;
                dailySheet.getCell(row, 1).value = item.date;
                dailySheet.getCell(row, 2).value = item.orders;
                dailySheet.getCell(row, 3).value = `₹${item.revenue.toLocaleString('en-IN')}`;
                dailySheet.getCell(row, 4).value = `₹${item.discount.toLocaleString('en-IN')}`;
                dailySheet.getCell(row, 5).value = `₹${item.netRevenue.toLocaleString('en-IN')}`;
            });

            // Add totals row
            const totalRow = dailyAnalysis.length + 4;
            dailySheet.getCell(totalRow, 1).value = 'TOTAL';
            dailySheet.getCell(totalRow, 1).font = { bold: true };
            dailySheet.getCell(totalRow, 2).value = salesStats.totalOrders;
            dailySheet.getCell(totalRow, 2).font = { bold: true };
            dailySheet.getCell(totalRow, 3).value = `₹${salesStats.totalRevenue.toLocaleString('en-IN')}`;
            dailySheet.getCell(totalRow, 3).font = { bold: true };
            dailySheet.getCell(totalRow, 4).value = `₹${salesStats.totalDiscount.toLocaleString('en-IN')}`;
            dailySheet.getCell(totalRow, 4).font = { bold: true };
            dailySheet.getCell(totalRow, 5).value = `₹${salesStats.netRevenue.toLocaleString('en-IN')}`;
            dailySheet.getCell(totalRow, 5).font = { bold: true };

            // Style daily analysis sheet
            dailySheet.columns = [
                { width: 15 },
                { width: 10 },
                { width: 15 },
                { width: 15 },
                { width: 15 }
            ];

            // Create Orders worksheet
            const ordersSheet = workbook.addWorksheet('Order Details');
            
            // Add headers
            ordersSheet.getCell('A1').value = 'Order Details';
            ordersSheet.getCell('A1').font = { bold: true, size: 14 };
            
            const orderHeaders = ['Order ID', 'Date', 'Customer', 'Payment Method', 'Status', 'Amount', 'Discount', 'Final Amount'];
            orderHeaders.forEach((header, index) => {
                const cell = ordersSheet.getCell(3, index + 1);
                cell.value = header;
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
            });

            // Add order data
            orders.forEach((order, index) => {
                const row = index + 4;
                ordersSheet.getCell(row, 1).value = order.orderId;
                ordersSheet.getCell(row, 2).value = order.date;
                ordersSheet.getCell(row, 3).value = order.customer;
                ordersSheet.getCell(row, 4).value = order.paymentMethod;
                ordersSheet.getCell(row, 5).value = order.status;
                ordersSheet.getCell(row, 6).value = `₹${order.amount.toLocaleString('en-IN')}`;
                ordersSheet.getCell(row, 7).value = `₹${order.discount.toLocaleString('en-IN')}`;
                ordersSheet.getCell(row, 8).value = `₹${order.finalAmount.toLocaleString('en-IN')}`;
            });

            // Style orders sheet
            ordersSheet.columns = [
                { width: 15 },
                { width: 12 },
                { width: 20 },
                { width: 15 },
                { width: 12 },
                { width: 15 },
                { width: 12 },
                { width: 15 }
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