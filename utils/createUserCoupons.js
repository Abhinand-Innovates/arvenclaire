const Coupon = require('../models/coupon-schema');
const UserCoupon = require('../models/user-coupon-schema');
const { generateWelcomeCouponCode, generateReferralRewardCouponCode } = require('./generateCouponCode');

// Create welcome coupon for new users
const createWelcomeCoupon = async (userId) => {
    try {
        let couponCode;
        let isUnique = false;
        
        // Generate unique coupon code
        while (!isUnique) {
            couponCode = generateWelcomeCouponCode();
            const existingCoupon = await Coupon.findOne({ code: couponCode });
            if (!existingCoupon) {
                isUnique = true;
            }
        }
        
        // Set expiry date to 30 days from now
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        
        const welcomeCoupon = new Coupon({
            code: couponCode,
            description: `Welcome to Arvenclaire! Enjoy 50% off on your first order. Valid for 30 days.`,
            discountType: 'percentage',
            discount: 50,
            minPurchase: 0, // No minimum purchase required
            maxDiscount: 2000, // Maximum discount of ₹2000
            startDate: new Date(),
            expiry: expiryDate,
            usageLimit: 1, // Only one user can use this coupon
            userUsageLimit: 1, // Each user can use it only once
            usedCount: 0,
            isActive: true,
            applicableCategories: [], // Applicable to all categories
            applicableProducts: [] // Applicable to all products
        });
        
        await welcomeCoupon.save();
        
        // Create user-coupon relationship
        const userCoupon = new UserCoupon({
            userId: userId,
            couponId: welcomeCoupon._id,
            isUsed: false
        });
        
        await userCoupon.save();
        return welcomeCoupon;
        
    } catch (error) {
        console.error('Error creating welcome coupon:', error);
        return null;
    }
};



// Create referral reward coupon for referrer
const createReferralRewardCoupon = async (referrerId, referredUserName) => {
    try {
        let couponCode;
        let isUnique = false;
        
        // Generate unique coupon code
        while (!isUnique) {
            couponCode = generateReferralRewardCouponCode();
            const existingCoupon = await Coupon.findOne({ code: couponCode });
            if (!existingCoupon) {
                isUnique = true;
            }
        }
        
        // Set expiry date to 60 days from now
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 60);
        
        const referralCoupon = new Coupon({
            code: couponCode,
            description: `Referral reward! Get 20% off on orders above ₹3500. Thank you for referring ${referredUserName}. Valid for 60 days.`,
            discountType: 'percentage',
            discount: 20,
            minPurchase: 3500, // Minimum purchase of ₹3500
            maxDiscount: 1500, // Maximum discount of ₹1500
            startDate: new Date(),
            expiry: expiryDate,
            usageLimit: 1, // Only one user can use this coupon
            userUsageLimit: 1, // Each user can use it only once
            usedCount: 0,
            isActive: true,
            applicableCategories: [], // Applicable to all categories
            applicableProducts: [] // Applicable to all products
        });
        
        await referralCoupon.save();
        
        // Create user-coupon relationship
        const userCoupon = new UserCoupon({
            userId: referrerId,
            couponId: referralCoupon._id,
            isUsed: false
        });
        
        await userCoupon.save();
        return referralCoupon;
        
    } catch (error) {
        console.error('Error creating referral reward coupon:', error);
        return null;
    }
};



module.exports = {
    createWelcomeCoupon,
    createReferralRewardCoupon
};