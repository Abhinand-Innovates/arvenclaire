// Admin return request management controller
const mongoose = require('mongoose');
const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');

const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let matchStage = {
      $or: [
        { status: 'Return Request' },
        { 
          $and: [
            { status: { $in: ['Delivered', 'Partially Returned'] } },
            { 'orderedItems.status': 'Return Request' }
          ]
        }
      ]
    };

    const totalRequests = await Order.countDocuments(matchStage);

    const returnRequests = await Order.find(matchStage)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName productImages mainImage regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const processedRequests = [];
    
    for (const order of returnRequests) {
      if (order.status === 'Return Request') {
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
        
        processedRequests.push({
          ...order.toObject(),
          returnType: 'entire',
          returnItems: order.orderedItems,
          returnAmount: currentTotal
        });
      } else {
        const returnRequestItems = order.orderedItems.filter(item => 
          item.status === 'Return Request'
        );
        
        if (returnRequestItems.length > 0) {
          returnRequestItems.forEach(item => {
            processedRequests.push({
              ...order.toObject(),
              returnType: 'individual',
              returnItems: [item],
              returnAmount: item.totalPrice || (item.price * item.quantity),
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

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        returnRequests: processedRequests,
        currentPage: page,
        totalPages,
        totalRequests,
        startIdx,
        endIdx
      });
    }

    res.render('return-request', {
      returnRequests: processedRequests,
      currentPage: page,
      totalPages,
      totalRequests,
      startIdx,
      endIdx,
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

const approveReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { adminNote } = req.body;
    
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email')
      .populate('orderedItems.product', 'productName quantity');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

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
      if (order.status === 'Returned' || order.returnApprovedAt) {
        return res.status(400).json({
          success: false,
          message: 'This return request has already been processed'
        });
      }
      
      if (order.status !== 'Return Request') {
        return res.status(403).json({
          success: false,
          message: 'Return can only be approved from Return Request status'
        });
      }
      
      order.status = 'Returned';
      
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
      
      refundAmount = currentTotal;
      
      for (const item of order.orderedItems) {
        if (item.status === 'Active' || item.status === 'Return Request') {
          item.status = 'Returned';
          item.returnApprovedAt = new Date();
          
          if (!item.returnReason) {
            item.returnReason = 'Entire order return approved by admin';
          }
          
          try {
            await Product.findByIdAndUpdate(
              item.product._id,
              { $inc: { quantity: item.quantity } }
            );
          } catch (stockError) {
            console.error('Error restoring product stock:', stockError);
          }
        }
      }
      
      returnedItemsDescription = 'Entire order';
    } else {
      const alreadyProcessedItems = returnRequestItems.filter(item => item.returnApprovedAt);
      if (alreadyProcessedItems.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some items in this return request have already been processed'
        });
      }
      
      for (const item of returnRequestItems) {
        item.status = 'Returned';
        item.returnApprovedAt = new Date();
        
        const itemRefundAmount = item.totalPrice || (item.price * item.quantity);
        refundAmount += itemRefundAmount;
        
        if (returnedItemsDescription) {
          returnedItemsDescription += ', ';
        }
        returnedItemsDescription += `${item.product.productName} (₹${itemRefundAmount.toFixed(2)})`;
        
        try {
          await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } }
          );
        } catch (stockError) {
          console.error('Error restoring individual item stock:', stockError);
        }
      }
      
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      if (activeItems.length === 0) {
        order.status = 'Returned';
      } else {
        order.status = 'Partially Returned';
      }
    }

    order.returnApprovedAt = new Date();
    order.adminNote = adminNote || 'Return request approved by admin';

    order.orderTimeline.push({
      status: order.status,
      timestamp: new Date(),
      description: `Return approved for: ${returnedItemsDescription}. Refund: ₹${refundAmount.toFixed(2)}. ${adminNote || 'Return approved by admin'}`
    });

    try {
      const wallet = await Wallet.getOrCreateWallet(order.userId._id);
      await wallet.addMoney(
        refundAmount,
        `Refund for returned items: ${returnedItemsDescription} (Order: ${order.orderId})`,
        order.orderId
      );
    } catch (walletError) {
      console.error('Error adding money to wallet:', walletError);
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
      message: 'Failed to approve return request',
      error: error.message
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
      .populate('userId', 'fullname email')
      .populate('orderedItems.product', 'productName');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

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
      order.status = 'Delivered';
      order.returnRejectedAt = new Date();
      order.rejectionReason = rejectionReason;
      
      for (const item of order.orderedItems) {
        if (item.status === 'Return Request') {
          item.status = 'Active';
          item.returnRejectedAt = new Date();
          item.rejectionReason = rejectionReason;
        }
      }
      
      rejectedItemsDescription = 'Entire order';
    } else {
      for (const item of returnRequestItems) {
        item.status = 'Active';
        item.returnRejectedAt = new Date();
        item.rejectionReason = rejectionReason;
        
        if (rejectedItemsDescription) {
          rejectedItemsDescription += ', ';
        }
        rejectedItemsDescription += item.product.productName;
      }
      
      order.returnRejectedAt = new Date();
      order.rejectionReason = rejectionReason;
    }

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