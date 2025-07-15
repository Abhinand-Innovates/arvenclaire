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
                margin: 50,
                size: 'A4',
                bufferPages: true
            });
            
            const filename = `ArvenClaire-Sales-Report-${new Date().toISOString().split('T')[0]}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            doc.pipe(res);

            // Page dimensions and layout constants
            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const margin = 50;
            const usableWidth = pageWidth - (margin * 2);
            const usableHeight = pageHeight - (margin * 2);

            // Helper function to draw borders and backgrounds
            const drawTableBorder = (x, y, width, height, fillColor = null) => {
                if (fillColor) {
                    doc.rect(x, y, width, height).fillAndStroke(fillColor, '#000000');
                } else {
                    doc.rect(x, y, width, height).stroke('#000000');
                }
            };

            // Helper function to add page header
            const addPageHeader = () => {
                // Company logo/header section with background
                doc.rect(margin, margin, usableWidth, 80).fillAndStroke('#f8f9fa', '#dee2e6');
                
                // Company name
                doc.fontSize(28).fillColor('#2c3e50').font('Helvetica-Bold');
                doc.text('ARVENCLAIRE', margin + 20, margin + 15, { align: 'center', width: usableWidth - 40 });
                
                // Report title
                doc.fontSize(14).fillColor('#34495e').font('Helvetica');
                doc.text('Sales Analytics Report', margin + 20, margin + 50, { align: 'center', width: usableWidth - 40 });
            };

            // Helper function to add page footer
            const addPageFooter = (pageNum) => {
                const footerY = pageHeight - margin - 30;
                
                // Footer line
                doc.strokeColor('#dee2e6').lineWidth(1)
                   .moveTo(margin, footerY)
                   .lineTo(pageWidth - margin, footerY)
                   .stroke();
                
                // Footer text
                doc.fontSize(8).fillColor('#6c757d').font('Helvetica');
                doc.text(`ArvenClaire Sales Report - Generated on ${new Date().toLocaleDateString('en-GB')}`, 
                         margin, footerY + 5, { align: 'left', width: usableWidth / 2 });
                doc.text(`Page ${pageNum}`, margin + (usableWidth / 2), footerY + 5, { align: 'right', width: usableWidth / 2 });
                doc.text('* All amounts in Indian Rupees (₹). Discounts include product offers and coupon discounts for active items only.', 
                         margin, footerY + 15, { align: 'center', width: usableWidth });
            };

            // Page 1: Header and Report Info
            addPageHeader();
            
            let currentY = margin + 100;
            
            // Report generation info section
            doc.rect(margin, currentY, usableWidth, 60).fillAndStroke('#e8f4fd', '#3498db');
            
            doc.fontSize(11).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text('Report Information', margin + 15, currentY + 10);
            
            doc.fontSize(10).fillColor('#34495e').font('Helvetica');
            const currentDate = new Date();
            doc.text(`Generated: ${currentDate.toLocaleDateString('en-GB')} at ${currentDate.toLocaleTimeString('en-GB')}`, 
                     margin + 15, currentY + 25);
            
            let periodText = `Period: ${filters.timePeriod?.toUpperCase() || 'MONTHLY'}`;
            if (filters.startDate && filters.endDate) {
                periodText = `Custom Period: ${new Date(filters.startDate).toLocaleDateString('en-GB')} to ${new Date(filters.endDate).toLocaleDateString('en-GB')}`;
            }
            doc.text(periodText, margin + 15, currentY + 37);
            
            doc.text(`Filters - Payment: ${filters.paymentMethod?.toUpperCase() || 'ALL'} | Status: ${filters.orderStatus?.toUpperCase() || 'ALL'}`, 
                     margin + 15, currentY + 49);
            
            currentY += 80;

            // Executive Summary Section
            doc.fontSize(16).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text('EXECUTIVE SUMMARY', margin, currentY, { align: 'center', width: usableWidth });
            currentY += 25;
            
            // Summary cards layout
            const cardWidth = (usableWidth - 30) / 3;
            const cardHeight = 80;
            const cardSpacing = 15;
            
            // Card 1: Revenue
            doc.rect(margin, currentY, cardWidth, cardHeight).fillAndStroke('#e8f5e8', '#27ae60');
            doc.fontSize(12).fillColor('#27ae60').font('Helvetica-Bold');
            doc.text('TOTAL REVENUE', margin + 10, currentY + 10, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(16).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text(`₹${salesStats.totalRevenue.toLocaleString('en-IN')}`, margin + 10, currentY + 30, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(9).fillColor('#34495e').font('Helvetica');
            doc.text('Gross Revenue', margin + 10, currentY + 55, { width: cardWidth - 20, align: 'center' });
            
            // Card 2: Orders
            doc.rect(margin + cardWidth + cardSpacing, currentY, cardWidth, cardHeight).fillAndStroke('#fff3cd', '#f39c12');
            doc.fontSize(12).fillColor('#f39c12').font('Helvetica-Bold');
            doc.text('TOTAL ORDERS', margin + cardWidth + cardSpacing + 10, currentY + 10, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(16).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text(`${salesStats.totalOrders.toLocaleString('en-IN')}`, margin + cardWidth + cardSpacing + 10, currentY + 30, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(9).fillColor('#34495e').font('Helvetica');
            doc.text(`Avg: ₹${Math.round(salesStats.averageOrder).toLocaleString('en-IN')}`, margin + cardWidth + cardSpacing + 10, currentY + 55, { width: cardWidth - 20, align: 'center' });
            
            // Card 3: Net Revenue
            doc.rect(margin + (cardWidth + cardSpacing) * 2, currentY, cardWidth, cardHeight).fillAndStroke('#f8d7da', '#e74c3c');
            doc.fontSize(12).fillColor('#e74c3c').font('Helvetica-Bold');
            doc.text('NET REVENUE', margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 10, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(16).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text(`₹${salesStats.netRevenue.toLocaleString('en-IN')}`, margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 30, { width: cardWidth - 20, align: 'center' });
            doc.fontSize(9).fillColor('#34495e').font('Helvetica');
            doc.text(`Discount: ₹${salesStats.totalDiscount.toLocaleString('en-IN')}`, margin + (cardWidth + cardSpacing) * 2 + 10, currentY + 55, { width: cardWidth - 20, align: 'center' });
            
            currentY += cardHeight + 30;

            // Performance Metrics Table
            doc.fontSize(14).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text('PERFORMANCE METRICS', margin, currentY, { align: 'center', width: usableWidth });
            currentY += 25;
            
            const metricsTableY = currentY;
            const metricsRowHeight = 25;
            const metricsColWidths = [usableWidth * 0.4, usableWidth * 0.3, usableWidth * 0.3];
            let metricsColX = [margin, margin + metricsColWidths[0], margin + metricsColWidths[0] + metricsColWidths[1]];
            
            // Metrics table header
            doc.rect(margin, metricsTableY, usableWidth, metricsRowHeight).fillAndStroke('#3498db', '#2980b9');
            doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold');
            doc.text('Metric', metricsColX[0] + 10, metricsTableY + 8, { width: metricsColWidths[0] - 20, align: 'left' });
            doc.text('Value', metricsColX[1] + 10, metricsTableY + 8, { width: metricsColWidths[1] - 20, align: 'center' });
            doc.text('Percentage', metricsColX[2] + 10, metricsTableY + 8, { width: metricsColWidths[2] - 20, align: 'center' });
            
            const metricsData = [
                ['Total Discount Amount', `₹${salesStats.totalDiscount.toLocaleString('en-IN')}`, `${((salesStats.totalDiscount / salesStats.totalRevenue) * 100).toFixed(1)}%`],
                ['Average Order Value', `₹${Math.round(salesStats.averageOrder).toLocaleString('en-IN')}`, '-'],
                ['Revenue Efficiency', `₹${salesStats.netRevenue.toLocaleString('en-IN')}`, `${((salesStats.netRevenue / salesStats.totalRevenue) * 100).toFixed(1)}%`]
            ];
            
            metricsData.forEach((row, index) => {
                const rowY = metricsTableY + metricsRowHeight + (index * metricsRowHeight);
                const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                
                doc.rect(margin, rowY, usableWidth, metricsRowHeight).fillAndStroke(bgColor, '#dee2e6');
                
                doc.fontSize(10).fillColor('#2c3e50').font('Helvetica');
                doc.text(row[0], metricsColX[0] + 10, rowY + 8, { width: metricsColWidths[0] - 20, align: 'left' });
                doc.font('Helvetica-Bold');
                doc.text(row[1], metricsColX[1] + 10, rowY + 8, { width: metricsColWidths[1] - 20, align: 'center' });
                doc.text(row[2], metricsColX[2] + 10, rowY + 8, { width: metricsColWidths[2] - 20, align: 'center' });
            });
            
            currentY = metricsTableY + metricsRowHeight + (metricsData.length * metricsRowHeight) + 30;

            // Daily Analysis Section
            if (currentY > pageHeight - margin - 200) {
                doc.addPage();
                addPageHeader();
                currentY = margin + 100;
            }
            
            doc.fontSize(14).fillColor('#2c3e50').font('Helvetica-Bold');
            doc.text('DAILY PERFORMANCE ANALYSIS', margin, currentY, { align: 'center', width: usableWidth });
            currentY += 25;
            
            const dailyTableY = currentY;
            const dailyRowHeight = 20;
            const dailyColWidths = [usableWidth * 0.2, usableWidth * 0.15, usableWidth * 0.25, usableWidth * 0.2, usableWidth * 0.2];
            const dailyColX = [];
            let dailyCurrentX = margin;
            dailyColWidths.forEach(width => {
                dailyColX.push(dailyCurrentX);
                dailyCurrentX += width;
            });
            
            // Daily table header
            doc.rect(margin, dailyTableY, usableWidth, dailyRowHeight).fillAndStroke('#34495e', '#2c3e50');
            doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold');
            const dailyHeaders = ['Date', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];
            dailyHeaders.forEach((header, i) => {
                doc.text(header, dailyColX[i] + 5, dailyTableY + 6, { width: dailyColWidths[i] - 10, align: 'center' });
            });
            
            // Daily data rows
            const maxDailyRows = Math.min(dailyAnalysis.length, 15);
            dailyAnalysis.slice(0, maxDailyRows).forEach((item, index) => {
                const rowY = dailyTableY + dailyRowHeight + (index * dailyRowHeight);
                const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                
                doc.rect(margin, rowY, usableWidth, dailyRowHeight).fillAndStroke(bgColor, '#dee2e6');
                
                doc.fontSize(9).fillColor('#2c3e50').font('Helvetica');
                const rowData = [
                    item.date,
                    item.orders.toString(),
                    `₹${item.revenue.toLocaleString('en-IN')}`,
                    `₹${item.discount.toLocaleString('en-IN')}`,
                    `₹${item.netRevenue.toLocaleString('en-IN')}`
                ];
                
                rowData.forEach((data, i) => {
                    const align = i === 0 ? 'left' : 'center';
                    doc.text(data, dailyColX[i] + 5, rowY + 6, { width: dailyColWidths[i] - 10, align: align });
                });
            });
            
            // Daily totals row
            const totalRowY = dailyTableY + dailyRowHeight + (maxDailyRows * dailyRowHeight);
            doc.rect(margin, totalRowY, usableWidth, dailyRowHeight).fillAndStroke('#e8f4fd', '#3498db');
            doc.fontSize(10).fillColor('#2c3e50').font('Helvetica-Bold');
            const totalRowData = [
                'TOTAL',
                salesStats.totalOrders.toString(),
                `₹${salesStats.totalRevenue.toLocaleString('en-IN')}`,
                `₹${salesStats.totalDiscount.toLocaleString('en-IN')}`,
                `₹${salesStats.netRevenue.toLocaleString('en-IN')}`
            ];
            
            totalRowData.forEach((data, i) => {
                const align = i === 0 ? 'left' : 'center';
                doc.text(data, dailyColX[i] + 5, totalRowY + 6, { width: dailyColWidths[i] - 10, align: align });
            });
            
            currentY = totalRowY + dailyRowHeight + 30;

            // Orders Detail Section
            if (orders.length > 0) {
                if (currentY > pageHeight - margin - 300) {
                    doc.addPage();
                    addPageHeader();
                    currentY = margin + 100;
                }
                
                doc.fontSize(14).fillColor('#2c3e50').font('Helvetica-Bold');
                doc.text('DETAILED ORDER ANALYSIS', margin, currentY, { align: 'center', width: usableWidth });
                currentY += 15;
                
                doc.fontSize(10).fillColor('#6c757d').font('Helvetica');
                doc.text(`Showing ${Math.min(orders.length, 20)} of ${orders.length} orders`, margin, currentY, { align: 'center', width: usableWidth });
                currentY += 25;
                
                const orderTableY = currentY;
                const orderRowHeight = 18;
                const orderColWidths = [usableWidth * 0.15, usableWidth * 0.12, usableWidth * 0.18, usableWidth * 0.15, usableWidth * 0.12, usableWidth * 0.14, usableWidth * 0.14];
                const orderColX = [];
                let orderCurrentX = margin;
                orderColWidths.forEach(width => {
                    orderColX.push(orderCurrentX);
                    orderCurrentX += width;
                });
                
                // Order table header
                doc.rect(margin, orderTableY, usableWidth, orderRowHeight).fillAndStroke('#495057', '#343a40');
                doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
                const orderHeaders = ['Order ID', 'Date', 'Customer', 'Payment', 'Status', 'Amount', 'Final'];
                orderHeaders.forEach((header, i) => {
                    doc.text(header, orderColX[i] + 3, orderTableY + 5, { width: orderColWidths[i] - 6, align: 'center' });
                });
                
                // Order data rows
                const maxOrderRows = Math.min(orders.length, 20);
                orders.slice(0, maxOrderRows).forEach((order, index) => {
                    const rowY = orderTableY + orderRowHeight + (index * orderRowHeight);
                    const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                    
                    doc.rect(margin, rowY, usableWidth, orderRowHeight).fillAndStroke(bgColor, '#dee2e6');
                    
                    doc.fontSize(8).fillColor('#2c3e50').font('Helvetica');
                    const orderRowData = [
                        order.orderId.length > 10 ? order.orderId.substring(0, 10) + '...' : order.orderId,
                        order.date,
                        order.customer.length > 12 ? order.customer.substring(0, 12) + '...' : order.customer,
                        order.paymentMethod.length > 8 ? order.paymentMethod.substring(0, 8) + '...' : order.paymentMethod,
                        order.status.length > 8 ? order.status.substring(0, 8) + '...' : order.status,
                        `₹${order.amount.toLocaleString('en-IN')}`,
                        `₹${order.finalAmount.toLocaleString('en-IN')}`
                    ];
                    
                    orderRowData.forEach((data, i) => {
                        const align = i < 2 ? 'left' : 'center';
                        doc.text(data, orderColX[i] + 3, rowY + 5, { width: orderColWidths[i] - 6, align: align });
                    });
                });
                
                if (orders.length > maxOrderRows) {
                    currentY = orderTableY + orderRowHeight + (maxOrderRows * orderRowHeight) + 15;
                    doc.fontSize(9).fillColor('#6c757d').font('Helvetica');
                    doc.text(`Note: Showing first ${maxOrderRows} orders out of ${orders.length} total orders.`, 
                             margin, currentY, { align: 'center', width: usableWidth });
                }
            }

            // Add footer to all pages
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                addPageFooter(i + 1);
            }

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