const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');
const Wallet = require('../../models/wallet-schema');
const InvoiceGenerator = require('../../utils/pdf-invoice-generator');



// Load order listing page
const loadOrderList = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { highlight } = req.query; // Get highlight parameter from query string

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's orders with populated product data
    const orders = await Order.find({ userId })
      .populate('orderedItems.product')
      .sort({ createdAt: -1 });

    res.render('order-list', {
      user,
      orders: orders || [],
      title: 'My Orders',
      highlightOrderId: highlight || null // Pass highlight parameter to view
    });
  } catch (error) {
    console.error('Error loading order list:', error);
    res.status(500).render('error', { message: 'Error loading orders' });
  }
};




// Load order details page
const loadOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('order-details', {
      user,
      order,
      title: `Order ${orderId}`
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(500).render('error', { message: 'Error loading order details' });
  }
};



// Cancel individual item
const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    console.log(`Cancel item request - OrderId: ${orderId}, ItemId: ${itemId}, UserId: ${userId}`);

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      console.log(`Order not found - OrderId: ${orderId}, UserId: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`Order found - Status: ${order.status}, Payment Status: ${order.paymentStatus}`);

    // Check if order can be cancelled based on status
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      console.log(`Order cannot be cancelled - Current status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Find the specific item
    const orderItem = order.orderedItems.id(itemId);
    if (!orderItem) {
      console.log(`Order item not found - ItemId: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    console.log(`Order item found - Status: ${orderItem.status}, Product: ${orderItem.product.productName}`);

    // Check if item can be cancelled
    if (orderItem.status !== 'Active') {
      console.log(`Item cannot be cancelled - Current status: ${orderItem.status}`);
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled or returned'
      });
    }

    // Cancel the item
    orderItem.status = 'Cancelled';
    orderItem.cancellationReason = reason || 'Item cancelled by customer';
    orderItem.cancelledAt = new Date();

    console.log(`Item marked as cancelled - ${orderItem.product.productName}`);

    // Restore product stock
    try {
      const productUpdateResult = await Product.findByIdAndUpdate(
        orderItem.product._id,
        { $inc: { quantity: orderItem.quantity } },
        { new: true }
      );

      if (productUpdateResult) {
        console.log(`Product stock restored - ${orderItem.product.productName}: +${orderItem.quantity}`);
      }
    } catch (stockError) {
      console.error('Error restoring product stock:', stockError);
      // Continue with order cancellation even if stock update fails
    }

    // Recalculate order amounts based on active items only
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const cancelledItems = order.orderedItems.filter(item => item.status === 'Cancelled');
    
    console.log(`Active items: ${activeItems.length}, Cancelled items: ${cancelledItems.length}`);
    
    if (activeItems.length === 0) {
      // All items cancelled - set amounts to 0
      order.status = 'Cancelled';
      order.totalPrice = 0;
      order.finalAmount = 0;
      console.log('All items cancelled - Order status set to Cancelled');
    } else {
      // Partially cancelled - recalculate based on active items with proportional discount
      order.status = 'Partially Cancelled';
      
      // Calculate totals
      const activeItemsTotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const cancelledItemsTotal = cancelledItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const originalOrderTotal = activeItemsTotal + cancelledItemsTotal;
      
      // Calculate proportional discount for active items only
      let applicableDiscount = 0;
      if (order.discount > 0 && originalOrderTotal > 0) {
        const activeItemsProportion = activeItemsTotal / originalOrderTotal;
        applicableDiscount = Math.min(order.discount * activeItemsProportion, activeItemsTotal);
      }
      
      // Update order totals
      order.totalPrice = activeItemsTotal;
      order.finalAmount = Math.max(0, activeItemsTotal - applicableDiscount + order.shippingCharges);
      
      console.log(`Order partially cancelled - New total: ₹${order.finalAmount}`);
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: order.status,
      description: `Item cancelled: ${orderItem.product.productName} - ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
    });

    // Credit wallet for ALL cancelled items (regardless of payment method)
    let walletCreditAmount = 0;
    
    // For COD orders, credit only if payment was made (status is Completed)
    // For online payments, credit if payment was completed
    // For pending payments, still credit to wallet as a refund
    if (order.paymentMethod === 'Cash on Delivery') {
      // For COD, only credit if payment was actually collected (status Completed)
      if (order.paymentStatus === 'Completed') {
        walletCreditAmount = orderItem.totalPrice;
        console.log(`COD order with completed payment - crediting ₹${walletCreditAmount} to wallet`);
      } else {
        console.log(`COD order with pending payment - no wallet credit needed`);
      }
    } else {
      // For online payments (including pending ones), always credit to wallet
      walletCreditAmount = orderItem.totalPrice;
      console.log(`Online payment order - crediting ₹${walletCreditAmount} to wallet`);
    }
    
    if (walletCreditAmount > 0) {
      console.log(`Processing wallet credit - Amount: ₹${walletCreditAmount}`);
      
      try {
        const wallet = await Wallet.getOrCreateWallet(userId);
        await wallet.addMoney(
          walletCreditAmount,
          `Refund for cancelled item: ${orderItem.product.productName} (Order: ${order.orderId})`,
          order.orderId
        );
        console.log(`Wallet credited successfully - ₹${walletCreditAmount} for order ${order.orderId}`);
      } catch (walletError) {
        console.error('Error adding money to wallet for cancelled item:', walletError);
        // Continue with cancellation even if wallet credit fails
      }
    }

    await order.save();
    console.log('Order saved successfully');

    const responseMessage = walletCreditAmount > 0 
      ? `Item cancelled successfully. ₹${walletCreditAmount} has been credited to your wallet.`
      : 'Item cancelled successfully';

    res.status(200).json({
      success: true,
      message: responseMessage,
      walletCredited: walletCreditAmount > 0,
      creditAmount: walletCreditAmount
    });

  } catch (error) {
    console.error('Error cancelling order item:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order item: ' + error.message
    });
  }
};



// Cancel entire order
const cancelEntireOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    console.log(`Cancel entire order request - OrderId: ${orderId}, UserId: ${userId}`);

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      console.log(`Order not found - OrderId: ${orderId}, UserId: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`Order found - Status: ${order.status}, Payment Status: ${order.paymentStatus}, Final Amount: ₹${order.finalAmount}`);

    // Check if order can be cancelled
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      console.log(`Order cannot be cancelled - Current status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Credit wallet for ALL cancelled orders (regardless of payment method) - BEFORE updating order amounts
    let walletCreditAmount = 0;
    
    // For COD orders, credit only if payment was made (status is Completed)
    // For online payments, credit the full amount regardless of payment status
    if (order.paymentMethod === 'Cash on Delivery') {
      // For COD, only credit if payment was actually collected (status Completed)
      if (order.paymentStatus === 'Completed') {
        walletCreditAmount = order.finalAmount;
        console.log(`COD order with completed payment - crediting ₹${walletCreditAmount} to wallet`);
      } else {
        console.log(`COD order with pending payment - no wallet credit needed`);
      }
    } else {
      // For online payments (including pending ones), always credit to wallet
      walletCreditAmount = order.finalAmount;
      console.log(`Online payment order - crediting ₹${walletCreditAmount} to wallet`);
    }
    
    if (walletCreditAmount > 0) {
      console.log(`Processing wallet credit for entire order - Amount: ₹${walletCreditAmount}`);
      
      try {
        const wallet = await Wallet.getOrCreateWallet(userId);
        await wallet.addMoney(
          walletCreditAmount,
          `Refund for cancelled order (Order: ${order.orderId})`,
          order.orderId
        );
        console.log(`Wallet credited successfully - ₹${walletCreditAmount} for cancelled order ${order.orderId}`);
      } catch (walletError) {
        console.error('Error adding money to wallet for cancelled order:', walletError);
        // Continue with cancellation even if wallet credit fails
      }
    }

    // Update order status and amounts AFTER wallet credit
    order.status = 'Cancelled';
    order.totalPrice = 0;
    order.finalAmount = 0;

    console.log('Order status updated to Cancelled');

    // Cancel all active items and restore stock
    let itemsCancelled = 0;
    for (const item of order.orderedItems) {
      if (item.status === 'Active') {
        item.status = 'Cancelled';
        item.cancellationReason = reason || 'Order cancelled by customer';
        item.cancelledAt = new Date();
        itemsCancelled++;

        console.log(`Cancelling item: ${item.product.productName}, Quantity: ${item.quantity}`);

        // Restore product stock
        try {
          const productUpdateResult = await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } },
            { new: true }
          );

          if (productUpdateResult) {
            console.log(`Product stock restored - ${item.product.productName}: +${item.quantity}, New stock: ${productUpdateResult.quantity}`);
          }
        } catch (stockError) {
          console.error('Error restoring product stock for item:', item.product.productName, stockError);
          // Continue with other items even if one fails
        }
      }
    }

    console.log(`Total items cancelled: ${itemsCancelled}`);

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Cancelled',
      description: `Order cancelled: ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
    });

    await order.save();
    console.log('Order saved successfully');

    const responseMessage = walletCreditAmount > 0 
      ? `Order cancelled successfully. ₹${walletCreditAmount} has been credited to your wallet.`
      : 'Order cancelled successfully';

    res.status(200).json({
      success: true,
      message: responseMessage,
      walletCredited: walletCreditAmount > 0,
      creditAmount: walletCreditAmount
    });

  } catch (error) {
    console.error('Error cancelling entire order:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order: ' + error.message
    });
  }
};



// Request return for an order (entire order or specific items)
const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason, items, requestType } = req.body;

    console.log(`Return request - OrderId: ${orderId}, UserId: ${userId}, RequestType: ${requestType}`);

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      console.log(`Order not found - OrderId: ${orderId}, UserId: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`Order found - Status: ${order.status}, Payment Status: ${order.paymentStatus}`);

    // Check if order can be returned (only delivered orders can be returned)
    if (order.status !== 'Delivered') {
      console.log(`Order cannot be returned - Current status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Check if return request already exists for entire order
    if (order.status === 'Return Request' || order.status === 'Returned') {
      console.log(`Return request already exists - Current status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: 'Return request already exists for this order'
      });
    }

    // Check if order is within return window (e.g., 7 days from delivery)
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      console.log(`Days since delivery: ${daysSinceDelivery}`);
      if (daysSinceDelivery > 7) {
        console.log('Return window has expired');
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Handle individual item returns vs entire order return
    if (items && Array.isArray(items) && items.length > 0) {
      // Individual item return(s)
      let returnedItemsCount = 0;
      let returnDescription = '';
      
      console.log(`Processing individual item returns - ${items.length} items`);
      
      for (const returnItem of items) {
        const orderItem = order.orderedItems.id(returnItem.itemId);
        if (orderItem && orderItem.status === 'Active') {
          orderItem.status = 'Return Request';
          orderItem.returnReason = returnItem.reason || reason || 'Return requested by customer';
          orderItem.returnRequestedAt = new Date();
          returnedItemsCount++;
          
          if (returnDescription) {
            returnDescription += ', ';
          }
          returnDescription += orderItem.product.productName;
          
          console.log(`Item marked for return: ${orderItem.product.productName}`);
        }
      }

      if (returnedItemsCount === 0) {
        console.log('No valid items found for return');
        return res.status(400).json({
          success: false,
          message: 'No valid items found for return'
        });
      }

      // Check if all active items are now being returned
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      
      console.log(`Active items: ${activeItems.length}, Return request items: ${returnRequestItems.length}`);
      
      if (activeItems.length === 0 && returnRequestItems.length > 0) {
        // All items are being returned
        order.status = 'Return Request';
        order.returnReason = `Individual items return: ${returnDescription}`;
        console.log('All items being returned - Order status set to Return Request');
      } else {
        // Partial return - keep order as delivered but mark items
        order.returnReason = `Partial return requested: ${returnDescription}`;
        console.log('Partial return requested');
      }

      order.returnRequestedAt = new Date();

      // Add to order timeline
      order.orderTimeline.push({
        status: returnedItemsCount === order.orderedItems.length ? 'Return Request' : 'Partial Return Request',
        description: `Return requested for items: ${returnDescription}`,
        timestamp: new Date()
      });

      await order.save();
      console.log('Order saved successfully');

      res.status(200).json({
        success: true,
        message: `Return request submitted for ${returnedItemsCount} item(s). Admin will review your request.`
      });

    } else {
      // Entire order return (legacy support)
      console.log('Processing entire order return');
      
      order.status = 'Return Request';
      order.returnReason = reason || 'Return requested by customer';
      order.returnRequestedAt = new Date();

      // Add to order timeline
      order.orderTimeline.push({
        status: 'Return Request',
        description: `Return requested: ${reason || 'Return requested by customer'}`,
        timestamp: new Date()
      });

      await order.save();
      console.log('Order saved successfully');

      res.status(200).json({
        success: true,
        message: 'Return request submitted successfully. Admin will review your request.'
      });
    }

  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request: ' + error.message
    });
  }
};



// Download PDF invoice for an order
const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is eligible for invoice download
    // For online payments: payment must be completed
    // For COD: invoice is available immediately after order placement
    const isEligibleForInvoice = 
      (order.paymentMethod === 'Cash on Delivery') ||
      (order.paymentMethod !== 'Cash on Delivery' && order.paymentStatus === 'Completed');

    if (!isEligibleForInvoice) {
      return res.status(403).json({
        success: false,
        message: 'Invoice is only available for completed payments. Please complete your payment first.'
      });
    }

    // Generate PDF invoice
    const invoiceGenerator = new InvoiceGenerator();
    const pdfBuffer = await invoiceGenerator.generateInvoice(order, user);

    // Set response headers for PDF download
    const filename = `Invoice-${order.orderId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice'
    });
  }
};



// Request return for individual item
const requestIndividualItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    console.log(`Individual item return request - OrderId: ${orderId}, ItemId: ${itemId}, UserId: ${userId}`);

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      console.log(`Order not found - OrderId: ${orderId}, UserId: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`Order found - Status: ${order.status}, Payment Status: ${order.paymentStatus}`);

    // Check if order can be returned (only delivered orders can be returned)
    if (order.status !== 'Delivered') {
      console.log(`Order cannot be returned - Current status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Find the specific item
    const orderItem = order.orderedItems.id(itemId);
    if (!orderItem) {
      console.log(`Order item not found - ItemId: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    console.log(`Order item found - Status: ${orderItem.status}, Product: ${orderItem.product.productName}`);

    // Check if item can be returned
    if (orderItem.status !== 'Active') {
      console.log(`Item cannot be returned - Current status: ${orderItem.status}`);
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled, returned, or has a return request'
      });
    }

    // Check if order is within return window (e.g., 7 days from delivery)
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      console.log(`Days since delivery: ${daysSinceDelivery}`);
      if (daysSinceDelivery > 7) {
        console.log('Return window has expired');
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Update item status to Return Request
    orderItem.status = 'Return Request';
    orderItem.returnReason = reason || 'Return requested by customer';
    orderItem.returnRequestedAt = new Date();

    console.log(`Item marked for return: ${orderItem.product.productName}`);

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Individual Item Return Request',
      description: `Return requested for item: ${orderItem.product.productName} - ${reason || 'Return requested by customer'}`,
      timestamp: new Date()
    });

    await order.save();
    console.log('Order saved successfully');

    res.status(200).json({
      success: true,
      message: `Return request submitted successfully for "${orderItem.product.productName}". Admin will review your request.`,
      itemName: orderItem.product.productName,
      returnAmount: orderItem.totalPrice
    });

  } catch (error) {
    console.error('Error requesting individual item return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request: ' + error.message
    });
  }
};



module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  requestReturn,
  requestIndividualItemReturn,
  downloadInvoice
};