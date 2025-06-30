const mongoose = require('mongoose');
const { Schema } = mongoose;

// Function to generate order ID in ORD-YYYYMMDD-XXXX format
const generateOrderId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `ORD-${year}${month}${day}-${random}`;
};

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: generateOrderId,
    unique: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderedItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Active', 'Cancelled', 'Returned', 'Return Request'],
      default: 'Active'
    },
    cancellationReason: {
      type: String,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    returnReason: {
      type: String,
      default: null
    },
    returnRequestedAt: {
      type: Date,
      default: null
    },
    returnApprovedAt: {
      type: Date,
      default: null
    },
    returnRejectedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    },
    returnAttempted: {
      type: Boolean,
      default: false
    }
  }],
  totalPrice: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  shippingCharges: {
    type: Number,
    default: 0
  },
  couponDiscount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  shippingAddress: {
    addressType: String,
    name: String,
    city: String,
    landMark: String,
    state: String,
    pincode: Number,
    phone: String,
    altPhone: String
  },
  paymentMethod: {
    type: String,
    enum: ['Cash on Delivery', 'Online Payment', 'Wallet'],
    default: 'Cash on Delivery'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed'],
    default: 'Pending'
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  invoiceDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Partially Cancelled', 'Partially Returned'],
    default: 'Pending'
  },
  orderTimeline: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    description: {
      type: String,
      required: true
    }
  }],
  couponApplied: {
    type: Boolean,
    default: false
  },
  estimatedDelivery: {
    type: Date,
    default: function() {
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 7); // 7 days from order
      return deliveryDate;
    }
  },
  returnReason: {
    type: String,
    default: null
  },
  returnRequestedAt: {
    type: Date,
    default: null
  },
  returnApprovedAt: {
    type: Date,
    default: null
  },
  returnRejectedAt: {
    type: Date,
    default: null
  },
  adminNote: {
    type: String,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  returnAttempted: {
    type: Boolean,
    default: false
  },
  coupon: {
    type: Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;