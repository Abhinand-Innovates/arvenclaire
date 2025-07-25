// User utility controller
const User = require("../../models/user-schema");
const Order = require('../../models/order-schema');
const Wallet = require('../../models/wallet-schema');

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

const loadReferrals = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('fullname email profilePhoto referralCode').lean();
    if (!user) {
      return res.redirect('/login');
    }

    const userWallet = await Wallet.findOne({ userId: userId });
    
    let referralTransactions = [];
    let totalEarnings = 0;
    let totalReferrals = 0;

    if (userWallet && userWallet.transactions) {
      referralTransactions = userWallet.transactions.filter(transaction => 
        transaction.description && transaction.description.includes('Referral bonus for referring')
      ).map(transaction => ({
        amount: transaction.amount,
        description: transaction.description,
        createdAt: transaction.createdAt,
        type: transaction.type
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      totalEarnings = referralTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      totalReferrals = referralTransactions.length;
    }

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

const loadAbout = async (req, res) => {
  try {
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

const loadContact = async (req, res) => {
  try {
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

const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

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
  validateReferralCode,
  loadReferrals,
  loadAbout,
  loadContact,
  submitContact
};