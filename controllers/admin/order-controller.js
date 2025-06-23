const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');

// Get all orders for admin with pagination and search
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    // Build search query
    let searchQuery = {};
    
    if (searchTerm) {
      searchQuery.$or = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
    }

    if (statusFilter) {
      searchQuery.status = statusFilter;
    }

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(searchQuery);

    // Get return request count for notification (including individual item returns)
    const returnRequestCount = await Order.countDocuments({
      $or: [
        { status: 'Return Request' },
        { 'orderedItems.status': 'Return Request' }
      ]
    });

    // Get orders with user details
    const orders = await Order.find(searchQuery)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalOrders / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalOrders);

    // If it's an API request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        orders,
        currentPage: page,
        totalPages,
        totalOrders,
        startIdx,
        endIdx,
        searchTerm,
        statusFilter
      });
    }

    // Render the orders page
    res.render('admin-order-listing', {
      orders,
      currentPage: page,
      totalPages,
      totalOrders,
      startIdx,
      endIdx,
      searchTerm,
      statusFilter,
      returnRequestCount,
      title: 'Order Management'
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};


// Get single order details (API)
const getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages regularPrice sellingPrice');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};


// Get order details page
const getOrderDetailsPage = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages regularPrice sellingPrice');

    if (!order) {
      return res.status(404).render('error', {
        message: 'Order not found',
        error: { status: 404 }
      });
    }

    // Calculate subtotal and final amount based on active products only
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const subtotalActiveProducts = activeItems.reduce((total, item) => {
      const regularPrice = item.product?.regularPrice || 0;
      return total + (regularPrice * item.quantity);
    }, 0);
    
    // Calculate final amount as subtotal minus discount
    const finalAmountActive = Math.max(0, subtotalActiveProducts - (order.discount || 0));

    // Check if order is cancelled by user
    const isUserCancelled = order.status === 'Cancelled';
    
    // Check if order has any items cancelled by user (not by admin)
    const hasUserCancellation = order.orderedItems.some(item => 
      item.status === 'Cancelled' && 
      item.cancellationReason && 
      !item.cancellationReason.includes('by admin')
    );

    res.render('admin-order-details', {
      order: {
        ...order.toObject(),
        subtotalActiveProducts: subtotalActiveProducts,
        finalAmountActive: finalAmountActive
      },
      isUserCancelled,
      hasUserCancellation,
      title: `Order Details - ${order.orderId}`
    });

  } catch (error) {
    console.error('Error fetching order details page:', error);
    res.status(500).render('error', {
      message: 'Failed to load order details',
      error: { status: 500 }
    });
  }
};


// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order was entirely cancelled by user
    const isUserCancelled = order.status === 'Cancelled' && 
      order.orderedItems.every(item => 
        item.status === 'Cancelled' && 
        item.cancellationReason && 
        !item.cancellationReason.includes('by admin')
      );

    if (isUserCancelled) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of an order that was cancelled by the customer'
      });
    }
    
    // Prevent changing from certain final states
    const finalStates = ['Delivered', 'Returned'];
    if (finalStates.includes(order.status) && status !== order.status) {
      return res.status(403).json({
        success: false,
        message: `Cannot change status from ${order.status} to ${status}`
      });
    }

    // Update order status
    order.status = status;
    
    // Add to timeline
    order.orderTimeline.push({
      status: status,
      timestamp: new Date(),
      description: `Order status updated to ${status} by admin`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};


// Note: approveReturnRequest function moved to return-controller.js to avoid duplication
// This function was causing double wallet credits


// Reject return request
const rejectReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'Return Request') {
      return res.status(400).json({
        success: false,
        message: 'Order is not in return request status'
      });
    }

    // Update order status back to Delivered
    order.status = 'Delivered';
    order.returnRejectedAt = new Date();
    order.rejectionReason = rejectionReason;

    // Add to timeline
    order.orderTimeline.push({
      status: 'Return Rejected',
      timestamp: new Date(),
      description: `Return request rejected: ${rejectionReason}`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Return request rejected successfully.',
      order
    });

  } catch (error) {
    console.error('Error rejecting return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject return request'
    });
  }
};


// Get return request count (including individual item returns)
const getReturnRequestCount = async (req, res) => {
  try {
    // Count orders with "Return Request" status (entire order returns)
    const entireOrderReturns = await Order.countDocuments({ 
      status: 'Return Request' 
    });

    // Count orders with individual item return requests
    const individualItemReturns = await Order.countDocuments({
      'orderedItems.status': 'Return Request'
    });

    // Total return requests (avoid double counting if an order has both)
    const totalReturnRequests = await Order.countDocuments({
      $or: [
        { status: 'Return Request' },
        { 'orderedItems.status': 'Return Request' }
      ]
    });

    res.json({
      success: true,
      count: totalReturnRequests,
      breakdown: {
        entireOrderReturns,
        individualItemReturns,
        total: totalReturnRequests
      }
    });

  } catch (error) {
    console.error('Error fetching return request count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return request count',
      count: 0
    });
  }
};

// Get return requests page
const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    // Build search query for ALL return-related orders (including history)
    let searchQuery = {
      $or: [
        { status: 'Return Request' },
        { status: 'Returned' },
        { returnRequestedAt: { $exists: true } }, // Orders that have ever had a return request
        { returnApprovedAt: { $exists: true } },  // Orders that have been approved
        { returnRejectedAt: { $exists: true } }   // Orders that have been rejected
      ]
    };
    
    // Apply status filter if provided
    if (statusFilter) {
      if (statusFilter === 'Pending') {
        searchQuery = { status: 'Return Request' };
      } else if (statusFilter === 'Approved' || statusFilter === 'Returned') {
        searchQuery = { status: 'Returned' };
      } else if (statusFilter === 'Rejected') {
        searchQuery = { 
          returnRejectedAt: { $exists: true },
          status: 'Delivered' 
        };
      } else {
        searchQuery.status = statusFilter;
      }
    }
    
    // Apply search term filter
    if (searchTerm) {
      const searchConditions = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
      
      if (statusFilter) {
        // If status filter is applied, combine with search
        searchQuery = {
          $and: [
            searchQuery,
            { $or: searchConditions }
          ]
        };
      } else {
        // If no status filter, combine search with return-related query
        searchQuery = {
          $and: [
            {
              $or: [
                { status: 'Return Request' },
                { status: 'Returned' },
                { returnRequestedAt: { $exists: true } },
                { returnApprovedAt: { $exists: true } },
                { returnRejectedAt: { $exists: true } }
              ]
            },
            { $or: searchConditions }
          ]
        };
      }
    }

    // Get total count for pagination
    const totalRequests = await Order.countDocuments({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] });

    // Get return requests with user and product details
    const returnRequests = await Order.find({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] })
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 }) // Sort by return request date first, then creation date
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalRequests / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalRequests);

    // If it's an API request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        returnRequests,
        currentPage: page,
        totalPages,
        totalRequests,
        startIdx,
        endIdx,
        searchTerm,
        statusFilter
      });
    }

    // Render the return requests page
    res.render('return-request', {
      returnRequests,
      currentPage: page,
      totalPages,
      totalRequests,
      startIdx,
      endIdx,
      searchTerm,
      statusFilter,
      title: 'Return Requests'
    });

  } catch (error) {
    console.error('Error fetching return requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return requests'
    });
  }
};

module.exports = {
  getOrders,
  getOrderById,
  getOrderDetailsPage,
  updateOrderStatus,
  rejectReturnRequest,
  getReturnRequestCount,
  getReturnRequests
};
