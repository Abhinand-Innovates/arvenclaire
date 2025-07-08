const User = require("../../models/user-schema");
const Order = require("../../models/order-schema");
const Product = require("../../models/product-schema");
const Category = require("../../models/category-schema");

// Admin dashboard controller - handles all dashboard-related operations
const getDashboardStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ 
      isAdmin: false, 
      isBlocked: false 
    });

    const totalOrders = await Order.countDocuments();

    const orders = await Order.find()
      .populate({
        path: 'orderedItems.product',
        select: 'regularPrice salePrice productOffer'
      });

    let totalNetRevenue = 0;

    for (const order of orders) {
      let activeTotalRegularPrice = 0;
      let activeTotalProductDiscount = 0;
      let activeTotalFinalPrice = 0;
      
      for (const item of order.orderedItems) {
        if (item.product && item.status === 'Active') {
          const regularPrice = item.product.regularPrice || 0;
          const salePrice = item.product.salePrice || regularPrice;
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
      
      totalNetRevenue += displayFinalAmount;
    }

    const totalRevenue = totalNetRevenue;

    const pendingOrders = await Order.countDocuments({
      status: { $in: ['Pending', 'Processing'] }
    });

    const responseData = {
      success: true,
      data: {
        totalCustomers,
        totalOrders,
        totalRevenue,
        pendingOrders
      }
    };

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




const getSalesData = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    let groupBy, dateFormat, labels;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    switch (period) {
      case 'weekly':
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
      
      default:
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

    const salesMap = {};
    salesData.forEach(item => {
      salesMap[item._id] = item.totalSales;
    });

    const data = labels.map(label => salesMap[label] || 0);

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
      default:
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




const getTopProducts = async (req, res) => {
  try {
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




const getRecentOrders = async (req, res) => {
  try {
    const recentOrders = await Order.find()
      .populate('userId', 'fullname email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderId userId finalAmount status createdAt paymentMethod');

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




const getNewCustomers = async (req, res) => {
  try {
    const newCustomers = await User.find({ 
      isAdmin: false,
      isBlocked: false 
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('fullname email createdAt profilePhoto');

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




const getBestSellingProducts = async (req, res) => {
  try {
    const bestSellingProducts = await Order.aggregate([
      {
        $unwind: '$orderedItems'
      },
      {
        $match: {
          'orderedItems.status': { $ne: 'Cancelled' }
        }
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
          brand: '$product.brand',
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

    res.json({
      success: true,
      data: bestSellingProducts
    });

  } catch (error) {
    console.error('Error fetching best selling products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch best selling products',
      error: error.message
    });
  }
};




const getBestSellingCategory = async (req, res) => {
  try {
    const bestSellingCategory = await Order.aggregate([
      {
        $unwind: '$orderedItems'
      },
      {
        $match: {
          'orderedItems.status': { $ne: 'Cancelled' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: '$orderedItems.totalPrice' },
          totalOrders: { $sum: 1 }
        }
      },
      {
        $sort: { totalRevenue: -1 }
      },
      {
        $limit: 1
      }
    ]);

    const result = bestSellingCategory.length > 0 ? bestSellingCategory[0] : null;

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching best selling category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch best selling category',
      error: error.message
    });
  }
};




const getBestSellingBrand = async (req, res) => {
  try {
    const bestSellingBrand = await Order.aggregate([
      {
        $unwind: '$orderedItems'
      },
      {
        $match: {
          'orderedItems.status': { $ne: 'Cancelled' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $group: {
          _id: '$product.brand',
          brandName: { $first: '$product.brand' },
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: '$orderedItems.totalPrice' },
          totalProducts: { $addToSet: '$product._id' }
        }
      },
      {
        $project: {
          brandName: 1,
          totalQuantity: 1,
          totalRevenue: 1,
          totalProducts: { $size: '$totalProducts' }
        }
      },
      {
        $sort: { totalQuantity: -1 }
      },
      {
        $limit: 1
      }
    ]);

    const result = bestSellingBrand.length > 0 ? bestSellingBrand[0] : null;

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching best selling brand:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch best selling brand',
      error: error.message
    });
  }
};




const getRevenueDistribution = async (req, res) => {
  try {
    const revenueDistribution = await Order.aggregate([
      {
        $match: {
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          totalRevenue: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalRevenue: -1 }
      }
    ]);

    const totalRevenue = revenueDistribution.reduce((sum, item) => sum + item.totalRevenue, 0);

    const formattedData = revenueDistribution.map(item => ({
      paymentMethod: item._id || 'Unknown',
      revenue: item.totalRevenue,
      orderCount: item.orderCount,
      percentage: totalRevenue > 0 ? ((item.totalRevenue / totalRevenue) * 100).toFixed(1) : 0
    }));

    res.json({
      success: true,
      data: formattedData,
      totalRevenue: totalRevenue
    });

  } catch (error) {
    console.error('Error fetching revenue distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue distribution',
      error: error.message
    });
  }
};




module.exports = {
  getDashboardStats,
  getSalesData,
  getTopProducts,
  getRecentOrders,
  getNewCustomers,
  getBestSellingProducts,
  getBestSellingCategory,
  getBestSellingBrand,
  getRevenueDistribution
};