const User = require("../../models/user-schema");
const Order = require("../../models/order-schema");
const Product = require("../../models/product-schema");

// Test endpoint
const testAPI = async (req, res) => {
  try {
    console.log('Test API called');
    res.json({
      success: true,
      message: 'Dashboard API is working!',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Test API error:', error);
    res.status(500).json({
      success: false,
      message: 'Test API failed',
      error: error.message
    });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    console.log('Dashboard stats API called');
    
    // Get total customers (non-admin users)
    const totalCustomers = await User.countDocuments({ 
      isAdmin: false, 
      isBlocked: false 
    });
    console.log('Total customers:', totalCustomers);

    // Get total orders
    const totalOrders = await Order.countDocuments();
    console.log('Total orders:', totalOrders);

    // Get total revenue (sum of finalAmount from all orders, not just completed ones for now)
    const revenueResult = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' }
        }
      }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    console.log('Total revenue:', totalRevenue);

    // Get pending orders
    const pendingOrders = await Order.countDocuments({
      status: { $in: ['Pending', 'Processing'] }
    });
    console.log('Pending orders:', pendingOrders);

    const responseData = {
      success: true,
      data: {
        totalCustomers,
        totalOrders,
        totalRevenue,
        pendingOrders
      }
    };

    console.log('Sending response:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
};

// Get sales data for chart
const getSalesData = async (req, res) => {
  try {
    console.log('Sales data API called with period:', req.query.period);
    const { period = 'monthly' } = req.query;
    let groupBy, dateFormat, labels;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    switch (period) {
      case 'weekly':
        // Get last 7 days
        groupBy = {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt"
          }
        };
        labels = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          labels.push(date.toISOString().split('T')[0]);
        }
        break;
      
      case 'yearly':
        // Get last 5 years
        groupBy = {
          $dateToString: {
            format: "%Y",
            date: "$createdAt"
          }
        };
        labels = [];
        for (let i = 4; i >= 0; i--) {
          labels.push((currentYear - i).toString());
        }
        break;
      
      default: // monthly
        groupBy = {
          $dateToString: {
            format: "%Y-%m",
            date: "$createdAt"
          }
        };
        labels = [];
        for (let i = 0; i < 12; i++) {
          const date = new Date(currentYear, i, 1);
          labels.push(date.toISOString().substring(0, 7));
        }
        break;
    }

    // Simplified query - get all orders for now
    const salesData = await Order.aggregate([
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    console.log('Raw sales data:', salesData);

    // Create a map for easy lookup
    const salesMap = {};
    salesData.forEach(item => {
      salesMap[item._id] = item.totalSales;
    });

    // Fill in the data array with 0 for missing periods
    const data = labels.map(label => salesMap[label] || 0);

    // Format labels for display
    let displayLabels;
    switch (period) {
      case 'weekly':
        displayLabels = labels.map(date => {
          const d = new Date(date);
          return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        });
        break;
      case 'yearly':
        displayLabels = labels;
        break;
      default: // monthly
        displayLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        break;
    }

    const responseData = {
      success: true,
      data: {
        labels: displayLabels,
        salesData: data
      }
    };

    console.log('Sales response:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales data',
      error: error.message
    });
  }
};

// Get top products
const getTopProducts = async (req, res) => {
  try {
    console.log('Top products API called');
    
    // Simplified query - get all orders and products
    const topProducts = await Order.aggregate([
      {
        $unwind: '$orderedItems'
      },
      {
        $group: {
          _id: '$orderedItems.product',
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: '$orderedItems.totalPrice' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          productName: '$product.productName',
          totalQuantity: 1,
          totalRevenue: 1,
          mainImage: '$product.mainImage'
        }
      },
      {
        $sort: { totalQuantity: -1 }
      },
      {
        $limit: 5
      }
    ]);

    console.log('Top products data:', topProducts);

    res.json({
      success: true,
      data: topProducts
    });

  } catch (error) {
    console.error('Error fetching top products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top products',
      error: error.message
    });
  }
};

// Get recent orders
const getRecentOrders = async (req, res) => {
  try {
    console.log('Recent orders API called');
    
    const recentOrders = await Order.find()
      .populate('userId', 'fullname email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderId userId finalAmount status createdAt paymentMethod');

    console.log('Recent orders data:', recentOrders);

    res.json({
      success: true,
      data: recentOrders
    });

  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent orders',
      error: error.message
    });
  }
};

// Get new customers
const getNewCustomers = async (req, res) => {
  try {
    console.log('New customers API called');
    
    const newCustomers = await User.find({ 
      isAdmin: false,
      isBlocked: false 
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('fullname email createdAt profilePhoto');

    console.log('New customers data:', newCustomers);

    res.json({
      success: true,
      data: newCustomers
    });

  } catch (error) {
    console.error('Error fetching new customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch new customers',
      error: error.message
    });
  }
};

module.exports = {
  testAPI,
  getDashboardStats,
  getSalesData,
  getTopProducts,
  getRecentOrders,
  getNewCustomers
};