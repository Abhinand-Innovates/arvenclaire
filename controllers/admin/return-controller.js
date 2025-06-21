const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');

// Get return requests with proper individual item support
const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    // Build aggregation pipeline to find orders with return requests
    let matchStage = {
      $or: [
        { status: 'Return Request' },
        { status: 'Returned' },
        { status: 'Partially Returned' },
        { 'orderedItems.status': 'Return Request' },
        { 'orderedItems.status': 'Returned' },
        { 'orderedItems.returnRequestedAt': { $exists: true } },
        { returnRequestedAt: { $exists: true } },
        { returnApprovedAt: { $exists: true } },
        { returnRejectedAt: { $exists: true } }
      ]
    };

    // Apply status filter
    if (statusFilter) {
      if (statusFilter === 'Pending') {
        matchStage = {
          $or: [
            { status: 'Return Request' },
            { 'orderedItems.status': 'Return Request' }
          ]
        };
      } else if (statusFilter === 'Approved' || statusFilter === 'Returned') {
        matchStage = {
          $or: [
            { status: 'Returned' },
            { status: 'Partially Returned' },
            { 'orderedItems.status': 'Returned' }
          ]
        };
      } else if (statusFilter === 'Rejected') {
        matchStage = { 
          $or: [
            { returnRejectedAt: { $exists: true } },
            { 'orderedItems.returnRejectedAt': { $exists: true } }
          ]
        };
      }
    }

    // Apply search term filter
    if (searchTerm) {
      const searchConditions = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
      
      matchStage = {
        $and: [
          matchStage,
          { $or: searchConditions }
        ]
      };
    }

    // Get total count for pagination
    const totalRequests = await Order.countDocuments(matchStage);

    // Get return requests with user and product details
    const returnRequests = await Order.find(matchStage)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages mainImage regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Return requests found and processed

    // Process return requests to extract individual item information
    const processedRequests = [];
    
    for (const order of returnRequests) {
      // Check if entire order is being returned
      if (order.status === 'Return Request') {
        processedRequests.push({
          ...order.toObject(),
          returnType: 'entire',
          returnItems: order.orderedItems,
          returnAmount: order.finalAmount
        });
      } else {
        // Check for individual item returns
        const returnRequestItems = order.orderedItems.filter(item => 
          item.status === 'Return Request' || item.status === 'Returned'
        );
        
        if (returnRequestItems.length > 0) {
          // For individual items, create separate entries for each returned item
          returnRequestItems.forEach(item => {
            processedRequests.push({
              ...order.toObject(),
              returnType: 'individual',
              returnItems: [item], // Only this specific item
              returnAmount: item.totalPrice || (item.price * item.quantity), // Only this item's amount
              individualItemId: item._id,
              individualItemName: item.product ? item.product.productName : 'Unknown Product'
            });
          });
        }
      }
    }

    const totalPages = Math.ceil(totalRequests / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalRequests);

    // If it's an API request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        returnRequests: processedRequests,
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
      returnRequests: processedRequests,
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

// Approve return request with individual item support
const approveReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { adminNote } = req.body;

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email')
      .populate('orderedItems.product', 'productName quantity');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if there are items with return request status or entire order is return request
    const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
    const isEntireOrderReturn = order.status === 'Return Request';

    if (!isEntireOrderReturn && returnRequestItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No return requests found for this order'
      });
    }

    let refundAmount = 0;
    let returnedItemsDescription = '';

    if (isEntireOrderReturn) {
      // Entire order return
      order.status = 'Returned';
      refundAmount = order.finalAmount;
      
      // Mark all active items as returned and restore stock
      for (const item of order.orderedItems) {
        if (item.status === 'Active') {
          item.status = 'Returned';
          item.returnApprovedAt = new Date();
          
          try {
            await Product.findByIdAndUpdate(
              item.product._id,
              { $inc: { quantity: item.quantity } }
            );
            // Product stock restored successfully
          } catch (stockError) {
            console.error('Error restoring product stock:', stockError);
          }
        }
      }
      
      returnedItemsDescription = 'Entire order';
    } else {
      // Individual item returns - Process ALL pending return request items
      for (const item of returnRequestItems) {
        item.status = 'Returned';
        item.returnApprovedAt = new Date();
        
        // Calculate refund amount for this specific item ONLY
        const itemRefundAmount = item.totalPrice || (item.price * item.quantity);
        refundAmount += itemRefundAmount;
        
        if (returnedItemsDescription) {
          returnedItemsDescription += ', ';
        }
        returnedItemsDescription += `${item.product.productName} (₹${itemRefundAmount.toFixed(2)})`;
        
        // Restore product stock for returned item ONLY
        try {
          await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } }
          );
          // Product stock restored successfully
        } catch (stockError) {
          console.error('Error restoring product stock:', stockError);
        }
      }
      
      // Check if all items are now returned
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      if (activeItems.length === 0) {
        order.status = 'Returned';
      } else {
        order.status = 'Partially Returned';
      }
    }

    order.returnApprovedAt = new Date();
    order.adminNote = adminNote || 'Return request approved by admin';

    // Add to timeline
    order.orderTimeline.push({
      status: order.status,
      timestamp: new Date(),
      description: `Return approved for: ${returnedItemsDescription}. Refund: ₹${refundAmount.toFixed(2)}. ${adminNote || 'Return approved by admin'}`
    });

    // Add ONLY the calculated refund amount to user's wallet
    try {
      const wallet = await Wallet.getOrCreateWallet(order.userId._id);
      await wallet.addMoney(
        refundAmount,
        `Refund for returned items: ${returnedItemsDescription} (Order: ${order.orderId})`,
        order.orderId
      );
      
      // Refund amount added to wallet successfully
    } catch (walletError) {
      console.error('Error adding money to wallet:', walletError);
      // Continue with order update even if wallet fails
    }

    await order.save();

    res.json({
      success: true,
      message: `Return request approved successfully. Refund of ₹${refundAmount.toFixed(2)} has been processed to customer wallet for: ${returnedItemsDescription}`,
      order,
      refundAmount,
      returnedItems: returnedItemsDescription
    });

  } catch (error) {
    console.error('Error approving return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve return request'
    });
  }
};

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

    // Check if there are items with return request status or entire order is return request
    const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
    const isEntireOrderReturn = order.status === 'Return Request';

    if (!isEntireOrderReturn && returnRequestItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No return requests found for this order'
      });
    }

    let rejectedItemsDescription = '';

    if (isEntireOrderReturn) {
      // Entire order return rejection
      order.status = 'Delivered';
      rejectedItemsDescription = 'Entire order';
    } else {
      // Individual item return rejection
      for (const item of returnRequestItems) {
        item.status = 'Active'; // Reset to active status
        
        if (rejectedItemsDescription) {
          rejectedItemsDescription += ', ';
        }
        rejectedItemsDescription += item.product.productName;
      }
    }

    order.returnRejectedAt = new Date();
    order.rejectionReason = rejectionReason;

    // Add to timeline
    order.orderTimeline.push({
      status: 'Return Rejected',
      timestamp: new Date(),
      description: `Return rejected for: ${rejectedItemsDescription}. Reason: ${rejectionReason}`
    });

    await order.save();

    res.json({
      success: true,
      message: `Return request rejected successfully for: ${rejectedItemsDescription}`,
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

module.exports = {
  getReturnRequests,
  approveReturnRequest,
  rejectReturnRequest
};