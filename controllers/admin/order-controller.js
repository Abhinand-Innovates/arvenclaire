// Admin order management controller
const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');

const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

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

    const totalOrders = await Order.countDocuments(searchQuery);

    const returnRequestCount = await Order.countDocuments({
      $or: [
        { status: 'Return Request' },
        { 'orderedItems.status': 'Return Request' }
      ]
    });

    const orders = await Order.find(searchQuery)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalOrders / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalOrders);

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

    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const subtotalActiveProducts = activeItems.reduce((total, item) => {
      const regularPrice = item.product?.regularPrice || 0;
      return total + (regularPrice * item.quantity);
    }, 0);
    
    const finalAmountActive = Math.max(0, subtotalActiveProducts - (order.discount || 0));

    const isUserCancelled = order.status === 'Cancelled';
    
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

const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    
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

    // Allow status updates for partially cancelled orders, but not for fully cancelled orders
    if (order.status === 'Cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of a fully cancelled order'
      });
    }

    // Check payment status - only allow status updates for completed payments (except COD)
    console.log(`Order ${orderId} - Payment Method: ${order.paymentMethod}, Payment Status: ${order.paymentStatus}`);
    if (order.paymentMethod !== 'Cash on Delivery' && order.paymentStatus !== 'Completed') {
      console.log(`Blocking status update for order ${orderId} due to incomplete payment`);
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of orders with pending or failed payments. Payment must be completed first.'
      });
    }
    
    const statusFlow = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'];
    const currentStatusIndex = statusFlow.indexOf(order.status);
    const newStatusIndex = statusFlow.indexOf(status);

    if (status === 'Cancelled') {
      if (!['Pending', 'Processing', 'Partially Cancelled'].includes(order.status)) {
        return res.status(403).json({
          success: false,
          message: 'Orders can only be cancelled when status is Pending, Processing, or Partially Cancelled'
        });
      }
    } else {
      // For partially cancelled orders, allow normal status progression for remaining items
      if (order.status === 'Partially Cancelled') {
        // Allow any forward progression from Partially Cancelled
        if (!['Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'].includes(status)) {
          return res.status(403).json({
            success: false,
            message: 'Invalid status transition from Partially Cancelled'
          });
        }
      } else {
        const finalStates = ['Delivered', 'Returned', 'Cancelled'];
        if (finalStates.includes(order.status) && status !== order.status) {
          return res.status(403).json({
            success: false,
            message: `Cannot change status from ${order.status} to ${status}`
          });
        }

        if (currentStatusIndex !== -1 && newStatusIndex !== -1) {
          if (status === 'Return Request' && order.status !== 'Delivered') {
            return res.status(403).json({
              success: false,
              message: 'Return Request can only be initiated from Delivered status'
            });
          }
          
          if (status === 'Returned' && order.status !== 'Return Request') {
            return res.status(403).json({
              success: false,
              message: 'Status can only be changed to Returned from Return Request'
            });
          }
          
          if (status !== 'Return Request' && status !== 'Returned') {
            if (newStatusIndex !== currentStatusIndex + 1) {
              return res.status(403).json({
                success: false,
                message: 'Status changes must follow the sequential order. Cannot skip statuses.'
              });
            }
          }
        }
      }
    }

    order.status = status;
    
    if (status === 'Cancelled') {
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      const includedItems = [...activeItems, ...returnRequestItems];
      
      let refundAmount = 0;
      includedItems.forEach(item => {
        refundAmount += item.totalPrice;
      });
      
      if (includedItems.length > 0) {
        refundAmount += order.shippingCharges;
      }
      
      if (order.couponApplied && order.couponDiscount > 0) {
        refundAmount -= order.couponDiscount;
      }
      
      if (refundAmount > 0) {
        try {
          const wallet = await Wallet.getOrCreateWallet(order.userId);
          await wallet.addMoney(
            refundAmount,
            `Refund for order cancelled by admin (Order: ${order.orderId})`,
            order.orderId
          );
        } catch (walletError) {
          console.error('Error adding money to wallet for admin cancelled order:', walletError);
        }
      }
      
      for (const item of order.orderedItems) {
        if (item.status === 'Active') {
          item.status = 'Cancelled';
          item.cancellationReason = 'Order cancelled by admin';
          item.cancelledAt = new Date();
          
          try {
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { quantity: item.quantity } }
            );
          } catch (stockError) {
            console.error('Error restoring product stock:', stockError);
          }
        }
      }
      
      order.totalPrice = 0;
      order.finalAmount = 0;
    }
    
    if (status === 'Delivered' && order.paymentMethod === 'Cash on Delivery' && order.paymentStatus === 'Pending') {
      order.paymentStatus = 'Completed';
      
      order.orderTimeline.push({
        status: 'Payment Completed',
        timestamp: new Date(),
        description: 'Payment collected on delivery (Cash on Delivery)'
      });
    }
    
    order.orderTimeline.push({
      status: status,
      timestamp: new Date(),
      description: status === 'Cancelled' 
        ? 'Order cancelled by admin' 
        : `Order status updated to ${status} by admin`
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

    order.status = 'Delivered';
    order.returnRejectedAt = new Date();
    order.rejectionReason = rejectionReason;

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

const getReturnRequestCount = async (req, res) => {
  try {
    const entireOrderReturns = await Order.countDocuments({ 
      status: 'Return Request' 
    });

    const individualItemReturns = await Order.countDocuments({
      'orderedItems.status': 'Return Request'
    });

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

const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    let searchQuery = {
      $or: [
        { status: 'Return Request' },
        { status: 'Returned' },
        { returnRequestedAt: { $exists: true } },
        { returnApprovedAt: { $exists: true } },
        { returnRejectedAt: { $exists: true } }
      ]
    };
    
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
    
    if (searchTerm) {
      const searchConditions = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
      
      if (statusFilter) {
        searchQuery = {
          $and: [
            searchQuery,
            { $or: searchConditions }
          ]
        };
      } else {
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

    const totalRequests = await Order.countDocuments({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] });

    const returnRequests = await Order.find({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] })
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalRequests / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalRequests);

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