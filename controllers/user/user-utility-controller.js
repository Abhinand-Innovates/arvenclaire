const User = require("../../models/user-schema");
const Order = require('../../models/order-schema');
const Wallet = require('../../models/wallet-schema');
const Coupon = require('../../models/coupon-schema');

// Load coupon page
const loadCouponPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    const UserCoupon = require('../../models/user-coupon-schema');

    // Get user-specific coupons and global active coupons
    const userCoupons = await UserCoupon.find({ userId: userId })
      .populate('couponId')
      .lean();

    // Get global active coupons (admin-created coupons available to all users)
    const globalCoupons = await Coupon.find({ 
      isActive: true,
      usageLimit: { $gt: 1 } // Global coupons typically have usage limit > 1
    }).lean();

    // Combine user-specific coupons with global coupons
    const allUserCoupons = [];

    // Add user-specific coupons
    userCoupons.forEach(userCoupon => {
      if (userCoupon.couponId && userCoupon.couponId.isActive) {
        allUserCoupons.push({
          ...userCoupon.couponId,
          userUsageCount: userCoupon.isUsed ? 1 : 0,
          isUserLimitExceeded: userCoupon.isUsed,
          isUserSpecific: true
        });
      }
    });

    // Add global coupons with usage tracking
    for (const coupon of globalCoupons) {
      // Check if user already has this coupon in their user-specific list
      const hasUserSpecificVersion = userCoupons.some(uc => 
        uc.couponId && uc.couponId._id.toString() === coupon._id.toString()
      );

      if (!hasUserSpecificVersion) {
        // Count how many times this user has used this global coupon
        const userUsageCount = await Order.countDocuments({
          userId: userId,
          coupon: coupon._id,
          paymentStatus: { $ne: 'Failed' }
        });

        allUserCoupons.push({
          ...coupon,
          userUsageCount: userUsageCount,
          isUserLimitExceeded: userUsageCount >= coupon.userUsageLimit,
          isUserSpecific: false
        });
      }
    }

    res.render('coupon', {
      user,
      title: 'My Coupons',
      coupons: allUserCoupons
    });
  } catch (error) {
    console.error('Error loading coupon page:', error);
    res.status(500).render('error', { message: 'Error loading coupon page' });
  }
};

// Validate referral code API endpoint
const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    
    if (!referralCode || !referralCode.trim()) {
      return res.json({
        success: true,
        valid: true,
        message: "Referral code is optional"
      });
    }
    
    const referrer = await User.findOne({ referralCode: referralCode.trim() });
    
    if (referrer) {
      return res.json({
        success: true,
        valid: true,
        message: "Valid referral code"
      });
    } else {
      return res.json({
        success: true,
        valid: false,
        message: "Invalid referral code"
      });
    }
  } catch (error) {
    console.error("Error validating referral code:", error);
    res.status(500).json({
      success: false,
      message: "Error validating referral code"
    });
  }
};

// Load referrals page
const loadReferrals = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto referralCode').lean();
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's wallet to find referral transactions
    const userWallet = await Wallet.findOne({ userId: userId });
    
    let referralTransactions = [];
    let totalEarnings = 0;
    let totalReferrals = 0;

    if (userWallet && userWallet.transactions) {
      // Filter referral bonus transactions
      referralTransactions = userWallet.transactions.filter(transaction => 
        transaction.description && transaction.description.includes('Referral bonus for referring')
      ).map(transaction => ({
        amount: transaction.amount,
        description: transaction.description,
        createdAt: transaction.createdAt,
        type: transaction.type
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Calculate totals
      totalEarnings = referralTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      totalReferrals = referralTransactions.length;
    }

    // Also get welcome bonus transactions for new users who used this user's referral code
    const welcomeBonusTransactions = await Wallet.aggregate([
      {
        $unwind: "$transactions"
      },
      {
        $match: {
          "transactions.description": { $regex: new RegExp(`Welcome bonus for using referral code ${user.referralCode}`) }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "referredUser"
        }
      },
      {
        $unwind: "$referredUser"
      },
      {
        $project: {
          referredUserName: "$referredUser.fullname",
          referredUserEmail: "$referredUser.email",
          amount: "$transactions.amount",
          createdAt: "$transactions.createdAt"
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    const referralLink = `${req.protocol}://${req.get('host')}/signup?ref=${user.referralCode}`;

    res.render('referrals', {
      user,
      referralCode: user.referralCode,
      totalReferrals,
      totalEarnings,
      referralLink,
      referralTransactions,
      welcomeBonusTransactions
    });
  } catch (error) {
    console.error('Error loading referrals page:', error);
    res.status(500).render('error', { message: 'Error loading referrals page' });
  }
};

// Load About page
const loadAbout = async (req, res) => {
  try {
    // User context is automatically added by middleware
    res.render('about', {
      title: 'About Us - ARVENCLAIRE'
    });
  } catch (error) {
    console.error('Error loading about page:', error);
    res.status(500).render('error', { 
      message: 'Error loading about page' 
    });
  }
};

// Load Contact page
const loadContact = async (req, res) => {
  try {
    // User context is automatically added by middleware
    res.render('contact', {
      title: 'Contact Us - ARVENCLAIRE'
    });
  } catch (error) {
    console.error('Error loading contact page:', error);
    res.status(500).render('error', { 
      message: 'Error loading contact page' 
    });
  }
};

// Submit Contact form
const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate input
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Here you could save the contact form data to database
    // For now, we'll just log it and send a success response

    // You could also send an email notification to admin here
    // await sendEmail(process.env.ADMIN_EMAIL, `New contact form submission from ${name}`);

    res.json({
      success: true,
      message: 'Thank you for your message! We will get back to you soon.'
    });

  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit your message. Please try again later.'
    });
  }
};

module.exports = {
  loadCouponPage,
  validateReferralCode,
  loadReferrals,
  loadAbout,
  loadContact,
  submitContact
};