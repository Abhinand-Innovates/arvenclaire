const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    },
    description: {
        type: String,
        required: true,
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat'],
        required: true,
    },
    discount: {
        type: Number,
        required: true,
    },
    minPurchase: {
        type: Number,
        required: true,
    },
    maxDiscount: {
        type: Number,
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    expiry: {
        type: Date,
        required: true,
    },
    usageLimit: {
        type: Number,
        required: true,
    },
    userUsageLimit: {
        type: Number,
        required: true,
    },
    usedCount: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
    }],
    applicableProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    }],
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);