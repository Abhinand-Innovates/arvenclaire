// Admin sales report controller
const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const salesReportController = {
    getFilteredData: async (filters) => {
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
            .populate('userId', 'fullname')
            .sort({ createdAt: -1 });

        const formattedOrders = await Promise.all(orders.map(async (order) => {
            await order.populate({
                path: 'orderedItems.product',
                select: 'regularPrice salePrice productOffer'
            });
            
            let activeTotalRegularPrice = 0;
            let activeTotalSalePrice = 0;
            let activeTotalProductDiscount = 0;
            let activeTotalFinalPrice = 0;
            
            for (const item of order.orderedItems) {
                if (item.product) {
                    const regularPrice = item.product.regularPrice || 0;
                    const salePrice = item.product.salePrice || regularPrice;
                    const quantity = item.quantity || 0;
                    const itemRegularTotal = regularPrice * quantity;
                    const itemSaleTotal = salePrice * quantity;
                    const itemFinalTotal = item.totalPrice || 0;
                    
                    if (item.status === 'Active') {
                        activeTotalRegularPrice += itemRegularTotal;
                        activeTotalSalePrice += itemSaleTotal;
                        activeTotalFinalPrice += itemFinalTotal;
                        
                        const itemProductDiscount = Math.max(0, itemRegularTotal - itemFinalTotal);
                        activeTotalProductDiscount += itemProductDiscount;
                    }
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
            
            const displayAmount = isEntireCancelled ? 0 : activeTotalRegularPrice;
            const displayDiscount = isEntireCancelled ? 0 : totalActiveDiscount;
            const displayFinalAmount = isEntireCancelled ? 0 : Math.max(0, calculatedFinalAmount);
            
            return {
                _id: order._id,
                orderId: order.orderId || 'N/A',
                date: order.createdAt ? order.createdAt.toLocaleDateString('en-GB') : 'N/A',
                customer: order.userId ? order.userId.fullname : 'Guest',
                paymentMethod: order.paymentMethod || 'N/A',
                status: order.status || 'Pending',
                amount: displayAmount,
                discount: displayDiscount,
                finalAmount: displayFinalAmount,
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

        let totalRegularPriceRevenue = 0;
        let totalDiscountAmount = 0;
        let totalFinalAmount = 0;
        
        for (const order of formattedOrders) {
            totalRegularPriceRevenue += order.amount;
            totalDiscountAmount += order.discount;
            totalFinalAmount += order.finalAmount;
        }
        
        const salesStats = {
            totalRevenue: totalRegularPriceRevenue,
            totalOrders: formattedOrders.length,
            totalDiscount: totalDiscountAmount,
            averageOrder: formattedOrders.length > 0 ? totalFinalAmount / formattedOrders.length : 0,
            netRevenue: totalFinalAmount,
            regularPriceTotal: totalRegularPriceRevenue
        };

        const dailyAnalysisMap = new Map();
        
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
            dayData.revenue += order.amount;
            dayData.discount += order.discount;
            dayData.netRevenue += order.finalAmount;
        }
        
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

    getSalesReport: async (req, res) => {
        try {
            const { 
                timePeriod = 'monthly', 
                paymentMethod = 'all', 
                orderStatus = 'all',
                page = 1,
                limit = 10,
                startDate,
                endDate
            } = req.query;

            const { orders: allOrders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData({
                timePeriod,
                paymentMethod,
                orderStatus,
                startDate,
                endDate
            });

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const paginatedOrders = allOrders.slice(skip, skip + parseInt(limit));
            const totalOrders = allOrders.length;
            const totalPages = Math.ceil(totalOrders / parseInt(limit));

            res.render('sales-report', {
                title: 'Sales Report',
                orders: paginatedOrders,
                salesStats,
                dailyAnalysis: dailyAnalysis.slice(0, 10),
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

    exportPDF: async (req, res) => {
        try {
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            const doc = new PDFDocument({ 
                margin: 40,
                size: 'A4'
            });
            
            const filename = `ArvenClaire-Sales-Report-${new Date().toISOString().split('T')[0]}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            doc.pipe(res);

            const pageWidth = 595.28;
            const leftMargin = 40;
            const usableWidth = pageWidth - 80;

            doc.fontSize(24).fillColor('#000000');
            doc.text('ARVENCLAIRE', { align: 'center' });
            doc.moveDown(0.3);
            
            doc.fontSize(16).fillColor('#666666');
            doc.text('Sales Analytics Report', { align: 'center' });
            doc.moveDown(1);
            
            doc.fontSize(11).fillColor('#333333');
            const currentDate = new Date();
            doc.text(`Generated: ${currentDate.toLocaleDateString('en-GB')} at ${currentDate.toLocaleTimeString('en-GB')}`, { align: 'center' });
            
            if (filters.startDate && filters.endDate) {
                doc.text(`Custom Date Range: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`, { align: 'center' });
            } else {
                doc.text(`Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`, { align: 'center' });
            }
            
            doc.text(`Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`, { align: 'center' });
            doc.moveDown(1.5);

            doc.fontSize(16).fillColor('#000000');
            doc.text('EXECUTIVE SUMMARY', { align: 'center', underline: true });
            doc.moveDown(1);
            
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

            doc.fontSize(14).fillColor('#000000');
            doc.text('DAILY PERFORMANCE ANALYSIS', { align: 'center', underline: true });
            doc.moveDown(1);
            
            doc.fontSize(9).fillColor('#000000');
            const tableY = doc.y;
            const colWidths = [80, 60, 100, 100, 100];
            const colX = [leftMargin, leftMargin + 80, leftMargin + 140, leftMargin + 240, leftMargin + 340];
            const headers = ['Date', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];
            
            headers.forEach((header, i) => {
                doc.text(header, colX[i], tableY, { width: colWidths[i], align: 'center' });
            });
            
            doc.y = tableY + 15;
            
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

            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('#000000');
            const totalY = doc.y;
            doc.text('TOTAL', colX[0], totalY, { width: colWidths[0], align: 'left' });
            doc.text(salesStats.totalOrders.toString(), colX[1], totalY, { width: colWidths[1], align: 'center' });
            doc.text(`₹${salesStats.totalRevenue.toLocaleString('en-IN')}`, colX[2], totalY, { width: colWidths[2], align: 'center' });
            doc.text(`₹${salesStats.totalDiscount.toLocaleString('en-IN')}`, colX[3], totalY, { width: colWidths[3], align: 'center' });
            doc.text(`₹${salesStats.netRevenue.toLocaleString('en-IN')}`, colX[4], totalY, { width: colWidths[4], align: 'center' });

            doc.y = totalY + 25;

            doc.fontSize(14).fillColor('#000000');
            doc.text('DETAILED ORDER ANALYSIS', { align: 'center', underline: true });
            doc.moveDown(0.5);
            
            doc.fontSize(9).fillColor('#666666');
            doc.text(`Showing ${Math.min(orders.length, 18)} of ${orders.length} orders`, { align: 'center' });
            doc.moveDown(1);
            
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
                
                if ((index + 1) % 6 === 0 && index < maxOrdersToShow - 1) {
                    doc.strokeColor('#e0e0e0').lineWidth(0.5)
                       .moveTo(leftMargin, doc.y + 1)
                       .lineTo(leftMargin + usableWidth - 40, doc.y + 1)
                       .stroke();
                    doc.y += 3;
                }
            });

            if (orders.length > maxOrdersToShow) {
                doc.moveDown(0.5);
                doc.fontSize(8).fillColor('#666666');
                doc.text(`Note: Showing first ${maxOrdersToShow} orders. Total: ${orders.length}`, { align: 'center' });
            }

            doc.fontSize(8).fillColor('#666666');
            doc.text(`ArvenClaire Sales Report - Generated on ${new Date().toLocaleDateString('en-GB')}`, 40, 770, { align: 'center' });
            doc.text('* All amounts in Indian Rupees (₹). Discounts include product offers and coupon discounts for active items only.', 40, 780, { align: 'center' });

            doc.end();

        } catch (error) {
            console.error('Error exporting PDF:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export PDF: ' + error.message
            });
        }
    },

    exportExcel: async (req, res) => {
        try {
            const filters = req.query;
            const { orders, salesStats, dailyAnalysis } = await salesReportController.getFilteredData(filters);

            const workbook = new ExcelJS.Workbook();
            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `ArvenClaire-Comprehensive-Sales-Report-${currentDate}.xlsx`;

            workbook.creator = 'ArvenClaire Sales System';
            workbook.lastModifiedBy = 'ArvenClaire Sales System';
            workbook.created = new Date();
            workbook.modified = new Date();

            const summarySheet = workbook.addWorksheet('Executive Summary');
            
            summarySheet.mergeCells('A1:H1');
            summarySheet.getCell('A1').value = 'ARVENCLAIRE - COMPREHENSIVE SALES REPORT';
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

            summarySheet.getCell('A5').value = 'KEY PERFORMANCE INDICATORS';
            summarySheet.getCell('A5').font = { size: 14, bold: true, color: { argb: 'FF2E75B6' } };
            summarySheet.mergeCells('A5:H5');
            summarySheet.getCell('A5').alignment = { horizontal: 'center' };

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

            const kpiData = [
                ['Total Revenue', `₹${salesStats.totalRevenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Gross revenue from all orders'],
                ['Net Revenue', `₹${salesStats.netRevenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Revenue after all discounts'],
                ['Total Orders', salesStats.totalOrders.toLocaleString('en-IN'), 'Number of orders processed'],
                ['Average Order Value', `₹${salesStats.averageOrder.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Average value per order'],
                ['Total Discounts', `₹${salesStats.totalDiscount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'Total discounts applied'],
                ['Discount Percentage', `${((salesStats.totalDiscount / salesStats.totalRevenue) * 100).toFixed(2)}%`, 'Percentage of revenue discounted']
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

            summarySheet.columns = [
                { width: 25 }, { width: 20 }, { width: 35 }, { width: 15 },
                { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
            ];

            const ordersSheet = workbook.addWorksheet('Detailed Orders');
            
            ordersSheet.getCell('A1').value = 'DETAILED ORDER ANALYSIS';
            ordersSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2E75B6' } };
            ordersSheet.mergeCells('A1:L1');
            ordersSheet.getCell('A1').alignment = { horizontal: 'center' };

            ordersSheet.getCell('A2').value = `Total Orders: ${orders.length}`;
            ordersSheet.getCell('A2').font = { size: 12, bold: true };

            const orderHeaders = [
                'Order ID', 'Date', 'Customer Name', 'Payment Method', 
                'Order Status', 'Gross Amount', 'Discount Applied', 'Final Amount'
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

            orders.forEach((order, index) => {
                const row = index + 5;
                const orderData = [
                    order.orderId,
                    order.date,
                    order.customer,
                    order.paymentMethod,
                    order.status,
                    order.amount,
                    order.discount,
                    order.finalAmount
                ];
                
                orderData.forEach((value, colIndex) => {
                    const cell = ordersSheet.getCell(row, colIndex + 1);
                    
                    if (typeof value === 'number' && colIndex >= 5) {
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
                    
                    if (colIndex === 4) {
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

            ordersSheet.columns = [
                { width: 15 }, { width: 12 }, { width: 20 }, { width: 15 },
                { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }
            ];

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

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