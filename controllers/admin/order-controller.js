const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');

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

    // Check if order is cancelled by user
    const isUserCancelled = order.status === 'Cancelled';
    
    // Check if order has any items cancelled by user (not by admin)
    const hasUserCancellation = order.orderedItems.some(item => 
      item.status === 'Cancelled' && 
      item.cancellationReason && 
      !item.cancellationReason.includes('by admin')
    );

    res.render('admin-order-details', {
      order,
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



module.exports = {
  getOrders,
  getOrderById,
  getOrderDetailsPage,
  updateOrderStatus
};
