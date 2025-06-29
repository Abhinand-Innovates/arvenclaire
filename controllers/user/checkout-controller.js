const Cart = require('../../models/cart-schema');
const Address = require('../../models/address-schema');
const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');
const Coupon = require('../../models/coupon-schema'); const Wallet = require('../../models/wallet-schema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { calculateFinalPrice, calculateItemTotal, calculateItemDiscount, syncAllCartPrices, calculateCartSummary } = require('../../utils/price-calculator');
const { applyBestOffersToProducts } = require('../../utils/offer-utils');

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
          select: 'name isListed isDeleted categoryOffer'
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

    // Apply offer calculations to cart items
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      // Map back to cart structure with offer details
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Sync cart prices with current product data and offers before checkout using utility function
    const priceUpdatesNeeded = await syncAllCartPrices(cartItems);

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

    // Calculate order summary with offer-based pricing
    let subtotal = 0; // Based on sale prices (before offers)
    let totalDiscount = 0; // Discount from offers
    let amountAfterDiscount = 0; // Amount customer actually pays (after offers)

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice; // Original sale price
      const quantity = item.quantity;
      
      // Get final price after offers (from stored cart price or offer details)
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      // Subtotal based on sale prices (before offers)
      subtotal += salePrice * quantity;
      
      // Calculate discount from offers
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item (after offers)
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // Check for address success message from session
    const addressSuccess = req.session.addressSuccess;
    if (addressSuccess) {
      delete req.session.addressSuccess; // Clear the message after reading
    }

    // Check if there's an applied coupon and validate its per-user limit
    let appliedCoupon = null;
    let couponRemovedMessage = null;
    
    if (req.session.appliedCoupon) {
      const couponId = req.session.appliedCoupon.couponId;
      
      // Get the coupon details
      const coupon = await Coupon.findById(couponId);
      
      if (coupon) {
        // Check how many times this user has used this coupon
        const userCouponUsage = await Order.countDocuments({
          userId: userId,
          coupon: coupon._id,
          paymentStatus: { $ne: 'Failed' } // Count all orders except failed ones
        });
        
        // If user has exceeded the per-user limit, remove the coupon
        if (userCouponUsage >= coupon.userUsageLimit) {
          delete req.session.appliedCoupon;
          couponRemovedMessage = `Coupon "${coupon.code}" has been removed as you have already used it ${coupon.userUsageLimit} time(s).`;
        } else {
          // Coupon is still valid for this user
          appliedCoupon = req.session.appliedCoupon;
        }
      } else {
        // Coupon doesn't exist anymore, remove it
        delete req.session.appliedCoupon;
        couponRemovedMessage = "Applied coupon is no longer valid and has been removed.";
      }
    }

    // Recalculate final amount with coupon discount if applicable
    let finalAmountWithCoupon = finalAmount;
    if (appliedCoupon) {
      finalAmountWithCoupon = finalAmount - appliedCoupon.discount;
    }

    // Get user-specific coupons and global coupons
    const UserCoupon = require('../../models/user-coupon-schema');
    
    // Get user-specific coupons that belong to this user
    const userCoupons = await UserCoupon.find({ 
      userId: userId,
      isUsed: false 
    }).populate({
      path: 'couponId',
      match: { 
        isActive: true, 
        expiry: { $gte: new Date() } 
      }
    });

    // Get global coupons (admin-created coupons with usage limit > 1, available to all users)
    const globalCoupons = await Coupon.find({ 
      isActive: true, 
      expiry: { $gte: new Date() },
      usageLimit: { $gt: 1 } // Global coupons typically have usage limit > 1
    });

    const availableCoupons = [];

    // Add user-specific coupons
    userCoupons.forEach(userCoupon => {
      if (userCoupon.couponId) {
        availableCoupons.push(userCoupon.couponId);
      }
    });

    // Add global coupons with usage tracking
    for (const coupon of globalCoupons) {
      // Check if user already has this coupon in their user-specific list
      const hasUserSpecificVersion = userCoupons.some(uc => 
        uc.couponId && uc.couponId._id.toString() === coupon._id.toString()
      );

      if (!hasUserSpecificVersion) {
        // Check how many times this user has used this global coupon
        const userCouponUsage = await Order.countDocuments({
          userId: userId,
          coupon: coupon._id,
          paymentStatus: { $ne: 'Failed' }
        });

        // Only include coupon if user hasn't reached their usage limit
        if (userCouponUsage < coupon.userUsageLimit) {
          availableCoupons.push(coupon);
        }
      }
    }

    res.render('checkout', {
      user,
      cartItems,
      addresses,
      orderSummary: {
        subtotal,
        totalDiscount,
        shippingCharges,
        finalAmount: finalAmountWithCoupon,
        couponDiscount: appliedCoupon ? appliedCoupon.discount : 0
      },
      addressSuccess,
      coupons: availableCoupons,
      appliedCoupon: appliedCoupon,
      couponRemovedMessage: couponRemovedMessage,
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
          select: 'name isListed isDeleted categoryOffer'
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

    // Apply offer calculations to cart items for order processing
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      // Map back to cart structure with offer details
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Calculate order totals with offer-based pricing
    let subtotal = 0; // Based on sale prices (before offers)
    let totalDiscount = 0; // Discount from offers
    let amountAfterDiscount = 0; // Amount customer actually pays (after offers)
    const orderedItems = [];

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice; // Original sale price
      const quantity = item.quantity;
      
      // Get final price after offers (from stored cart price or offer details)
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      // Subtotal based on sale prices (before offers)
      subtotal += salePrice * quantity;
      
      // Calculate discount from offers
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item (after offers)
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: finalPrice, // Store final price after offers
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    
    // Handle coupon discount if applied
    let couponDiscount = 0;
    let appliedCouponId = null;
    let couponApplied = false;
    
    if (req.session.appliedCoupon) {
      couponDiscount = req.session.appliedCoupon.discount || 0;
      appliedCouponId = req.session.appliedCoupon.couponId;
      couponApplied = true;
    }
    
    const finalAmount = amountAfterDiscount + shippingCharges - couponDiscount; // Final amount = amount after discount + shipping - coupon discount

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
      couponDiscount,
      shippingCharges,
      finalAmount,
      coupon: appliedCouponId,
      couponApplied,
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

    // Update coupon usage count if coupon was applied
    if (appliedCouponId && (paymentMethod === 'Wallet' || paymentMethod === 'Cash on Delivery')) {
      await Coupon.findByIdAndUpdate(
        appliedCouponId,
        { $inc: { usedCount: 1 } }
      );

      // If it's a user-specific coupon, mark it as used
      const appliedCoupon = await Coupon.findById(appliedCouponId);
      if (appliedCoupon && appliedCoupon.usageLimit === 1) {
        const UserCoupon = require('../../models/user-coupon-schema');
        await UserCoupon.findOneAndUpdate(
          { userId: userId, couponId: appliedCouponId },
          { 
            isUsed: true, 
            usedAt: new Date(),
            orderId: order._id 
          }
        );
      }
    }

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

    // Clear cart and applied coupon from session
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } }
    );
    
    // Clear applied coupon from session
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

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
          select: 'name isListed isDeleted categoryOffer'
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

    // Apply offer calculations to cart items for Razorpay order
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      // Map back to cart structure with offer details
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Calculate order totals with offer-based pricing
    let subtotal = 0;
    let totalDiscount = 0;
    let amountAfterDiscount = 0;
    const orderedItems = [];

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice; // Original sale price
      const quantity = item.quantity;
      
      // Get final price after offers (from stored cart price or offer details)
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      subtotal += salePrice * quantity;
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: finalPrice,
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    
    // Handle coupon discount if applied
    let couponDiscount = 0;
    let appliedCouponId = null;
    let couponApplied = false;
    
    if (req.session.appliedCoupon) {
      couponDiscount = req.session.appliedCoupon.discount || 0;
      appliedCouponId = req.session.appliedCoupon.couponId;
      couponApplied = true;
    }
    
    const finalAmount = amountAfterDiscount + shippingCharges - couponDiscount;

    // Create order first (with pending payment status)
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      couponDiscount,
      shippingCharges,
      finalAmount,
      coupon: appliedCouponId,
      couponApplied,
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

    // Update coupon usage count if coupon was applied and payment is completed
    if (order.coupon) {
      await Coupon.findByIdAndUpdate(
        order.coupon,
        { $inc: { usedCount: 1 } }
      );

      // If it's a user-specific coupon, mark it as used
      const appliedCoupon = await Coupon.findById(order.coupon);
      if (appliedCoupon && appliedCoupon.usageLimit === 1) {
        const UserCoupon = require('../../models/user-coupon-schema');
        await UserCoupon.findOneAndUpdate(
          { userId: order.userId, couponId: order.coupon },
          { 
            isUsed: true, 
            usedAt: new Date(),
            orderId: order._id 
          }
        );
      }
    }

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

// Apply coupon
const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { couponCode, orderAmount } = req.body;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a coupon code'
      });
    }

    // Find the coupon
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999); // End of today
    
    const coupon = await Coupon.findOne({ 
      code: couponCode.toUpperCase(), 
      isActive: true, 
      expiry: { $gte: today },
      startDate: { $lte: endOfToday }
    });

    if (!coupon) {
      // Check if coupon exists but doesn't meet criteria for better error messages
      const couponWithoutDateCheck = await Coupon.findOne({ 
        code: couponCode.toUpperCase()
      });
      
      if (couponWithoutDateCheck) {
        if (!couponWithoutDateCheck.isActive) {
          return res.status(400).json({
            success: false,
            message: 'This coupon is currently inactive'
          });
        } else if (new Date(couponWithoutDateCheck.expiry).setHours(23,59,59,999) < new Date().setHours(0,0,0,0)) {
          return res.status(400).json({
            success: false,
            message: 'This coupon has expired'
          });
        } else if (new Date(couponWithoutDateCheck.startDate).setHours(0,0,0,0) > new Date().setHours(0,0,0,0)) {
          return res.status(400).json({
            success: false,
            message: 'This coupon is not yet active'
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Check if this is a user-specific coupon (usage limit = 1)
    if (coupon.usageLimit === 1) {
      const UserCoupon = require('../../models/user-coupon-schema');
      
      // Check if this user has access to this user-specific coupon
      const userCoupon = await UserCoupon.findOne({
        userId: userId,
        couponId: coupon._id,
        isUsed: false
      });

      if (!userCoupon) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is not available for your account'
        });
      }
    }

    // Check if coupon usage limit is reached
    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has reached its usage limit'
      });
    }

    // Check how many times this user has used this coupon
    const userCouponUsage = await Order.countDocuments({
      userId: userId,
      coupon: coupon._id,
      paymentStatus: { $ne: 'Failed' } // Count all orders except failed ones
    });

    // Check per-user usage limit
    if (userCouponUsage >= coupon.userUsageLimit) {
      return res.status(400).json({
        success: false,
        message: `You have already used this coupon ${coupon.userUsageLimit} time(s). Each user can use this coupon only ${coupon.userUsageLimit} time(s).`
      });
    }

    // Check minimum purchase requirement
    if (orderAmount < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value should be ₹${coupon.minPurchase}`
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (orderAmount * coupon.discount) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discount;
    }

    // Store coupon in session
    req.session.appliedCoupon = {
      code: coupon.code,
      discount: discount,
      couponId: coupon._id
    };

    res.status(200).json({
      success: true,
      message: `Coupon applied! You saved ₹${discount.toFixed(2)}`,
      discount: discount,
      couponCode: coupon.code
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying coupon. Please try again.'
    });
  }
};

// Remove coupon
const removeCoupon = async (req, res) => {
  try {
    delete req.session.appliedCoupon;
    res.status(200).json({
      success: true,
      message: 'Coupon removed successfully'
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing coupon. Please try again.'
    });
  }
};

module.exports = {
  loadCheckout,
  applyCoupon,
  removeCoupon,
  placeOrder,
  loadOrderSuccess,
  createRazorpayOrder,
  verifyPayment,
  paymentFailed,
  loadRetryPayment,
  loadOrderFailure
};
