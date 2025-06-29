const Order = require("../../models/order-schema");
const User = require("../../models/user-schema");
const Product = require("../../models/product-schema");
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const getSalesReport = async (req, res) => {
  try {
    // Check if admin is authenticated (middleware should handle this)
    if (!req.session.admin_id) {
      return res.redirect('/admin-login');
    }

    // Debug: Check total orders in database
    const totalOrdersInDB = await Order.countDocuments({});
    console.log(`Total orders in database: ${totalOrdersInDB}`);
    
    if (totalOrdersInDB > 0) {
      const sampleOrders = await Order.find({}).limit(3).populate('userId', 'fullname email');
      console.log('Sample orders:', sampleOrders.map(o => ({
        orderId: o.orderId,
        status: o.status,
        finalAmount: o.finalAmount,
        createdAt: o.createdAt,
        customer: o.userId ? o.userId.fullname : 'No user'
      })));
    }

    // Get filter parameters from query
    const { 
      startDate, 
      endDate, 
      period = 'all',
      paymentMethod = 'all',
      orderStatus = 'all',
      page = 1,
      limit = 10 
    } = req.query;

    // Build date filter
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        };
        break;
      case 'week':
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        dateFilter = {
          createdAt: { $gte: weekStart }
        };
        break;
      case 'month':
        const monthStart = new Date();
        monthStart.setDate(monthStart.getDate() - 30);
        dateFilter = {
          createdAt: { $gte: monthStart }
        };
        break;
      case 'year':
        const yearStart = new Date();
        yearStart.setFullYear(yearStart.getFullYear() - 1);
        dateFilter = {
          createdAt: { $gte: yearStart }
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
      default:
        // No date filter for 'all'
        break;
    }

    // Build payment method filter
    let paymentFilter = {};
    if (paymentMethod !== 'all') {
      paymentFilter.paymentMethod = paymentMethod;
    }

    // Build order status filter
    let statusFilter = {};
    if (orderStatus !== 'all') {
      statusFilter.status = orderStatus;
    } else {
      // If no specific status selected, exclude cancelled orders by default
      statusFilter.status = { $nin: ['Cancelled'] };
    }

    // Get orders with filters
    const orders = await Order.find({
      ...dateFilter,
      ...paymentFilter,
      ...statusFilter
    })
    .populate('userId', 'fullname email')
    .populate('orderedItems.product', 'productName')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    // Get total count for pagination
    const totalOrdersForPagination = await Order.countDocuments({
      ...dateFilter,
      ...paymentFilter,
      ...statusFilter
    });

    // Calculate summary statistics with proper amount calculation (same as order details page)
    // For sales statistics, always use delivered orders regardless of status filter
    const deliveredOrdersFilter = {
      ...dateFilter,
      ...paymentFilter,
      status: { $in: ['Delivered'] }
    };
    
    const deliveredOrders = await Order.find(deliveredOrdersFilter);

    let totalSales = 0;
    let totalDiscount = 0;
    let totalCouponDiscount = 0;
    let deliveredOrdersCount = deliveredOrders.length;

    deliveredOrders.forEach(order => {
      // Calculate current total (same as order details page)
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      const includedItems = [...activeItems, ...returnRequestItems];
      
      let amountAfterDiscount = 0;
      includedItems.forEach(item => {
        amountAfterDiscount += item.totalPrice;
      });
      
      let currentTotal = amountAfterDiscount;
      if (includedItems.length > 0) {
        currentTotal += order.shippingCharges;
      }
      
      // Subtract coupon discount if applied
      if (order.couponApplied && order.couponDiscount > 0) {
        currentTotal -= order.couponDiscount;
      }

      totalSales += currentTotal;
      totalDiscount += (order.discount + order.couponDiscount);
      totalCouponDiscount += order.couponDiscount || 0;
    });

    const salesSummary = [{
      totalSales: totalSales,
      totalOrders: deliveredOrdersCount,
      totalDiscount: totalDiscount,
      totalCouponDiscount: totalCouponDiscount,
      averageOrderValue: deliveredOrdersCount > 0 ? totalSales / deliveredOrdersCount : 0
    }];

    // Get additional statistics for all orders (respecting status filter)
    const allOrdersStats = await Order.aggregate([
      {
        $match: {
          ...dateFilter,
          ...paymentFilter,
          ...statusFilter
        }
      },
      {
        $group: {
          _id: null,
          totalOrdersAll: { $sum: 1 },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0]
            }
          },
          processingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Processing'] }, 1, 0]
            }
          },
          shippedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Shipped'] }, 1, 0]
            }
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Top products removed as requested

    // Calculate pagination
    const totalPages = Math.ceil(totalOrdersForPagination / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Render the sales report page
    res.render('admin-sales-report', {
      orders,
      salesSummary: salesSummary[0] || {
        totalSales: 0,
        totalOrders: 0,
        totalDiscount: 0,
        totalCouponDiscount: 0,
        averageOrderValue: 0
      },
      orderStats: allOrdersStats[0] || {
        totalOrdersAll: 0,
        pendingOrders: 0,
        processingOrders: 0,
        shippedOrders: 0,
        deliveredOrders: 0
      },
      currentPage: parseInt(page),
      totalPages,
      hasNextPage,
      hasPrevPage,
      period,
      paymentMethod,
      orderStatus,
      startDate,
      endDate,
      admin: res.locals.admin
    });

  } catch (error) {
    console.error("Error loading sales report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load sales report",
    });
  }
};

// API endpoint for sales data (for charts/AJAX)
const getSalesData = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let groupBy;
    let dateFormat;
    
    switch (period) {
      case 'week':
        groupBy = {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        };
        dateFormat = 'daily';
        break;
      case 'month':
        groupBy = {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        };
        dateFormat = 'daily';
        break;
      case 'year':
        groupBy = {
          $dateToString: { format: "%Y-%m", date: "$createdAt" }
        };
        dateFormat = 'monthly';
        break;
      default:
        groupBy = {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        };
        dateFormat = 'daily';
    }

    const salesData = await Order.aggregate([
      {
        $match: {
          status: { $in: ['Delivered', 'Shipped', 'Processing'] }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: salesData,
      format: dateFormat
    });

  } catch (error) {
    console.error("Error fetching sales data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales data"
    });
  }
};

// Export sales report to Excel
const exportToExcel = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      period = 'all',
      paymentMethod = 'all',
      orderStatus = 'all'
    } = req.query;

    // Build date filter (same logic as getSalesReport)
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        };
        break;
      case 'week':
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        dateFilter = {
          createdAt: { $gte: weekStart }
        };
        break;
      case 'month':
        const monthStart = new Date();
        monthStart.setDate(monthStart.getDate() - 30);
        dateFilter = {
          createdAt: { $gte: monthStart }
        };
        break;
      case 'year':
        const yearStart = new Date();
        yearStart.setFullYear(yearStart.getFullYear() - 1);
        dateFilter = {
          createdAt: { $gte: yearStart }
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
    }

    // Build payment method filter
    let paymentFilter = {};
    if (paymentMethod !== 'all') {
      paymentFilter.paymentMethod = paymentMethod;
    }

    // Build order status filter
    let statusFilter = {};
    if (orderStatus !== 'all') {
      statusFilter.status = orderStatus;
    } else {
      // Default to non-cancelled orders for export
      statusFilter.status = { $in: ['Delivered', 'Shipped', 'Processing'] };
    }

    // Get orders for export
    const orders = await Order.find({
      ...dateFilter,
      ...paymentFilter,
      ...statusFilter
    })
    .populate('userId', 'fullname email')
    .populate('orderedItems.product', 'productName')
    .sort({ createdAt: -1 });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Add headers
    worksheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Customer Email', key: 'customerEmail', width: 30 },
      { header: 'Order Date', key: 'orderDate', width: 15 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'Discount', key: 'discount', width: 12 },
      { header: 'Final Amount', key: 'finalAmount', width: 15 },
      { header: 'Payment Method', key: 'paymentMethod', width: 20 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Add data
    orders.forEach(order => {
      worksheet.addRow({
        orderId: order.orderId,
        customerName: order.userId ? order.userId.fullname : 'N/A',
        customerEmail: order.userId ? order.userId.email : 'N/A',
        orderDate: order.createdAt.toLocaleDateString('en-IN'),
        totalAmount: order.totalPrice,
        discount: order.discount + order.couponDiscount,
        finalAmount: order.finalAmount,
        paymentMethod: order.paymentMethod,
        status: order.status
      });
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export sales report"
    });
  }
};

// Export sales report to PDF
const exportToPDF = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      period = 'all',
      paymentMethod = 'all',
      orderStatus = 'all'
    } = req.query;

    // Build date filter (same logic as getSalesReport)
    let dateFilter = {};
    
    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        };
        break;
      case 'week':
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        dateFilter = {
          createdAt: { $gte: weekStart }
        };
        break;
      case 'month':
        const monthStart = new Date();
        monthStart.setDate(monthStart.getDate() - 30);
        dateFilter = {
          createdAt: { $gte: monthStart }
        };
        break;
      case 'year':
        const yearStart = new Date();
        yearStart.setFullYear(yearStart.getFullYear() - 1);
        dateFilter = {
          createdAt: { $gte: yearStart }
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
    }

    // Build payment method filter
    let paymentFilter = {};
    if (paymentMethod !== 'all') {
      paymentFilter.paymentMethod = paymentMethod;
    }

    // Build order status filter
    let statusFilter = {};
    if (orderStatus !== 'all') {
      statusFilter.status = orderStatus;
    } else {
      // Default to non-cancelled orders for export
      statusFilter.status = { $in: ['Delivered', 'Shipped', 'Processing'] };
    }

    // Get orders and summary for PDF
    const orders = await Order.find({
      ...dateFilter,
      ...paymentFilter,
      ...statusFilter
    })
    .populate('userId', 'fullname email')
    .sort({ createdAt: -1 })
    .limit(50); // Limit for PDF to avoid too large files

    const salesSummary = await Order.aggregate([
      {
        $match: {
          ...dateFilter,
          ...paymentFilter,
          ...statusFilter
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          totalDiscount: { $sum: { $add: ['$discount', '$couponDiscount'] } },
          averageOrderValue: { $avg: '$finalAmount' }
        }
      }
    ]);

    const summary = salesSummary[0] || {
      totalSales: 0,
      totalOrders: 0,
      totalDiscount: 0,
      averageOrderValue: 0
    };

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
    
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text('ARVENCLAIRE - Sales Report', { align: 'center' });
    doc.moveDown();

    // Add period info
    let periodText = 'All Time';
    switch (period) {
      case 'today': periodText = 'Today'; break;
      case 'week': periodText = 'Last 7 Days'; break;
      case 'month': periodText = 'Last 30 Days'; break;
      case 'year': periodText = 'Last Year'; break;
      case 'custom': periodText = `${startDate} to ${endDate}`; break;
    }
    doc.fontSize(12).text(`Period: ${periodText}`, { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
    doc.moveDown();

    // Add summary
    doc.fontSize(14).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Sales: ₹${summary.totalSales.toLocaleString('en-IN')}`);
    doc.text(`Total Orders: ${summary.totalOrders}`);
    doc.text(`Total Discount: ₹${summary.totalDiscount.toLocaleString('en-IN')}`);
    doc.text(`Average Order Value: ₹${Math.round(summary.averageOrderValue).toLocaleString('en-IN')}`);
    doc.moveDown();

    // Add orders table
    doc.fontSize(14).text('Recent Orders', { underline: true });
    doc.fontSize(8);

    let y = doc.y;
    const tableTop = y + 10;
    const itemHeight = 20;

    // Table headers
    doc.text('Order ID', 50, tableTop);
    doc.text('Customer', 150, tableTop);
    doc.text('Date', 250, tableTop);
    doc.text('Amount', 320, tableTop);
    doc.text('Status', 400, tableTop);

    // Draw header line
    doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();

    // Add order data
    orders.slice(0, 20).forEach((order, index) => {
      const y = tableTop + 25 + (index * itemHeight);
      
      doc.text(order.orderId, 50, y);
      doc.text(order.userId ? order.userId.fullname : 'N/A', 150, y);
      doc.text(order.createdAt.toLocaleDateString('en-IN'), 250, y);
      doc.text(`₹${order.finalAmount.toLocaleString('en-IN')}`, 320, y);
      doc.text(order.status, 400, y);
    });

    doc.end();

  } catch (error) {
    console.error("Error exporting to PDF:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export sales report"
    });
  }
};

// Function to create sample orders for testing (only if no orders exist)
const createSampleOrders = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments({});
    if (totalOrders > 0) {
      return res.json({ message: 'Orders already exist in database', count: totalOrders });
    }

    // Get a sample user and product
    const sampleUser = await User.findOne({});
    const sampleProduct = await Product.findOne({});

    if (!sampleUser || !sampleProduct) {
      return res.json({ error: 'Need at least one user and one product to create sample orders' });
    }

    const sampleOrders = [];
    const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    
    for (let i = 0; i < 10; i++) {
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      const randomAmount = Math.floor(Math.random() * 5000) + 1000;
      const randomDate = new Date();
      randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 30));

      const order = new Order({
        userId: sampleUser._id,
        orderedItems: [{
          product: sampleProduct._id,
          quantity: Math.floor(Math.random() * 3) + 1,
          price: sampleProduct.salePrice,
          totalPrice: randomAmount
        }],
        totalPrice: randomAmount,
        finalAmount: randomAmount,
        status: randomStatus,
        paymentMethod: 'Cash on Delivery',
        paymentStatus: randomStatus === 'Delivered' ? 'Completed' : 'Pending',
        shippingAddress: {
          name: sampleUser.fullname,
          city: 'Sample City',
          state: 'Sample State',
          pincode: 123456,
          phone: '9876543210'
        },
        createdAt: randomDate
      });

      sampleOrders.push(order);
    }

    await Order.insertMany(sampleOrders);
    
    res.json({ 
      message: 'Sample orders created successfully', 
      count: sampleOrders.length 
    });

  } catch (error) {
    console.error('Error creating sample orders:', error);
    res.status(500).json({ error: 'Failed to create sample orders' });
  }
};

module.exports = {
  getSalesReport,
  getSalesData,
  exportToExcel,
  exportToPDF,
  createSampleOrders
};