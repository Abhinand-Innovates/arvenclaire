const Cart = require('../../models/cart-schema');
const Address = require('../../models/address-schema');
const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');
const Wallet = require('../../models/wallet-schema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { calculateFinalPrice, calculateItemTotal, calculateItemDiscount, syncAllCartPrices, calculateCartSummary } = require('../../utils/price-calculator');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// Load checkout page
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data and wallet balance
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get wallet balance
    const wallet = await Wallet.getOrCreateWallet(userId);
    user.walletBalance = wallet.balance;

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Filter out items with unavailable products and sync prices
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Sync cart prices with current product data before checkout using utility function
    const priceUpdatesNeeded = syncAllCartPrices(cartItems);

    // Save updated prices to database if needed
    if (priceUpdatesNeeded) {
      await cart.save();
    }

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    // Check for out-of-stock items
    const outOfStockItems = cartItems.filter(item => item.productId.quantity === 0);
    if (outOfStockItems.length > 0) {
      req.session.checkoutError = 'Some items in your cart are out of stock. Please remove them to proceed.';
      return res.redirect('/cart');
    }

    // Get user's addresses
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    // Calculate order summary with subtotal based on regular prices
    let subtotal = 0; // Based on regular prices (before discount)
    let totalDiscount = 0; // Difference between regular and sale prices
    let amountAfterDiscount = 0; // Amount customer actually pays (after discount)

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      // Subtotal based on regular prices
      subtotal += regularPrice * quantity;
      
      // Calculate discount
      const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item
      const itemFinalAmount = calculateItemTotal(salePrice, quantity);
      amountAfterDiscount += itemFinalAmount;
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // Check for address success message from session
    const addressSuccess = req.session.addressSuccess;
    if (addressSuccess) {
      delete req.session.addressSuccess; // Clear the message after reading
    }

    res.render('checkout', {
      user,
      cartItems,
      addresses,
      orderSummary: {
        subtotal,
        totalDiscount,
        shippingCharges,
        finalAmount
      },
      addressSuccess,
      title: 'Checkout'
    });

  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Error loading checkout page' });
  }
};



// Process order placement
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddressId, paymentMethod = 'Cash on Delivery' } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // If wallet payment, check wallet balance first
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      // We'll check balance after calculating final amount
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Filter available items and validate stock
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Final stock validation
    for (const item of cartItems) {
      if (item.productId.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productId.productName}`
        });
      }
    }

    // Get selected address
    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(selectedAddressId);
    
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Selected address not found'
      });
    }

    // Calculate order totals with subtotal based on regular prices
    let subtotal = 0; // Based on regular prices (before discount)
    let totalDiscount = 0; // Difference between regular and sale prices
    let amountAfterDiscount = 0; // Amount customer actually pays (after discount)
    const orderedItems = [];

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      // Subtotal based on regular prices
      subtotal += regularPrice * quantity;
      
      // Calculate discount
      const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item
      const itemFinalAmount = calculateItemTotal(salePrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: salePrice, // Store sale price as the price
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // If wallet payment, check if sufficient balance
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      if (wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}`
        });
      }
    }

    // Create order
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      shippingCharges,
      finalAmount,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        city: selectedAddress.city,
        landMark: selectedAddress.landMark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone
      },
      paymentMethod,
      paymentStatus: paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      orderTimeline: [{
        status: 'Pending',
        description: 'Order placed successfully'
      }]
    });

    await order.save();

    // Process wallet payment if selected
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      await wallet.deductMoney(
        finalAmount,
        `Order payment for ${order.orderId}`,
        order.orderId
      );
      await wallet.save();
    }

    // Update product quantities
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } }
    );

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Error placing order. Please try again.'
    });
  }
};



// Load order success page
const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.redirect('/orders');
    }

    const user = await User.findById(userId).select('fullname email profilePhoto');

    res.render('order-success', {
      user,
      order,
      title: 'Order Confirmed'
    });

  } catch (error) {
    console.error('Error loading order success:', error);
    res.status(500).render('error', { message: 'Error loading order confirmation' });
  }
};

// Create Razorpay order
const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddressId, paymentMethod } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // Get user's cart and calculate order details (similar to placeOrder)
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Filter available items and validate stock
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Final stock validation
    for (const item of cartItems) {
      if (item.productId.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productId.productName}`
        });
      }
    }

    // Get selected address
    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(selectedAddressId);
    
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Selected address not found'
      });
    }

    // Calculate order totals
    let subtotal = 0;
    let totalDiscount = 0;
    let amountAfterDiscount = 0;
    const orderedItems = [];

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      subtotal += regularPrice * quantity;
      const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
      totalDiscount += itemDiscount;
      const itemFinalAmount = calculateItemTotal(salePrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: salePrice,
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    const finalAmount = amountAfterDiscount + shippingCharges;

    // Create order first (with pending payment status)
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      shippingCharges,
      finalAmount,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        city: selectedAddress.city,
        landMark: selectedAddress.landMark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone
      },
      paymentMethod,
      paymentStatus: 'Pending',
      orderTimeline: [{
        status: 'Pending',
        description: 'Order created, awaiting payment'
      }]
    });

    await order.save();

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: order.orderId,
      notes: {
        orderId: order.orderId,
        userId: userId.toString()
      }
    });

    // Get user data for prefill
    const user = await User.findById(userId).select('fullname email');

    res.status(200).json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: finalAmount,
      currency: 'INR',
      razorpayOrderId: razorpayOrder.id,
      orderId: order.orderId,
      prefill: {
        name: user.fullname,
        email: user.email,
        contact: selectedAddress.phone
      }
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment order. Please try again.'
    });
  }
};



// Verify Razorpay payment
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Mark payment as failed
      const order = await Order.findOne({ orderId });
      if (order) {
        order.paymentStatus = 'Failed';
        order.orderTimeline.push({
          status: 'Payment Failed',
          description: 'Payment signature verification failed'
        });
        await order.save();
      }
      
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        orderId: orderId
      });
    }

    // Update order status
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order with payment details
    order.paymentStatus = 'Completed';
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    order.orderTimeline.push({
      status: 'Payment Completed',
      description: 'Payment verified successfully'
    });

    await order.save();

    // Update product quantities
    for (const item of order.orderedItems) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { userId: order.userId },
      { $set: { items: [] } }
    );

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully'
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    
    // Mark payment as failed if order exists
    try {
      const { orderId } = req.body;
      if (orderId) {
        const order = await Order.findOne({ orderId });
        if (order) {
          order.paymentStatus = 'Failed';
          order.orderTimeline.push({
            status: 'Payment Failed',
            description: 'Payment verification error occurred'
          });
          await order.save();
        }
      }
    } catch (updateError) {
      console.error('Error updating order status:', updateError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      orderId: req.body.orderId
    });
  }
};



// Handle payment failure
const paymentFailed = async (req, res) => {
  try {
    const { orderId, error } = req.body;

    // Update order status
    const order = await Order.findOne({ orderId });
    if (order) {
      order.paymentStatus = 'Failed';
      order.orderTimeline.push({
        status: 'Payment Failed',
        description: `Payment failed: ${error.description || 'Unknown error'}`
      });
      await order.save();
    }

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded',
      orderId: orderId
    });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling payment failure'
    });
  }
};



// Load retry payment page
const loadRetryPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.redirect('/orders');
    }

    // Check if order payment is actually failed
    if (order.paymentStatus !== 'Failed') {
      return res.redirect(`/order-details/${orderId}`);
    }

    // Create new Razorpay order for retry
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: order.orderId + '_retry_' + Date.now(),
      notes: {
        orderId: order.orderId,
        userId: userId.toString(),
        retry: 'true'
      }
    });

    res.render('retry-payment', {
      user,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.finalAmount,
      currency: 'INR',
      name: 'ARVENCLAIRE',
      description: 'Order Payment Retry',
      razorpayOrderId: razorpayOrder.id,
      prefill: {
        name: user.fullname,
        email: user.email,
        contact: order.shippingAddress.phone
      },
      theme: {
        color: '#000000'
      },
      title: 'Retry Payment'
    });

  } catch (error) {
    console.error('Error loading retry payment:', error);
    res.status(500).render('error', { message: 'Error loading retry payment page' });
  }
};



// Load order failure page
const loadOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.redirect('/orders');
    }

    res.render('order-failure', {
      user,
      order,
      title: 'Payment Failed'
    });

  } catch (error) {
    console.error('Error loading order failure:', error);
    res.status(500).render('error', { message: 'Error loading order failure page' });
  }
};



module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderSuccess,
  createRazorpayOrder,
  verifyPayment,
  paymentFailed,
  loadRetryPayment,
  loadOrderFailure
};
