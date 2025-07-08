// User authentication controller - handles login, signup, password reset, and OTP verification
const User = require("../../models/user-schema");
const generateOtp = require("../../utils/generateOtp");
const { generateReferralCodeWithPrefix } = require("../../utils/generateReferralCode");
const sendEmail = require("../../utils/sendEmail");
const bcrypt = require("bcrypt");
const Product = require("../../models/product-schema");
const Category = require("../../models/category-schema");
const Wallet = require('../../models/wallet-schema');
const Review = require("../../models/review-schema");
const { createWelcomeCoupon, createReferralRewardCoupon } = require("../../utils/createUserCoupons");
const { getProductsWithBestOffers } = require("../../utils/offer-utils");

const loadLanding = async (req, res) => {
  try {
    const filter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    const options = {
      sort: { createdAt: -1 },
      limit: 12
    };

    const productsWithOffers = await getProductsWithBestOffers(filter, options);

    const productsWithRatings = await Promise.all(
      productsWithOffers.map(async (product) => {
        const reviews = await Review.find({
          product: product._id,
          isHidden: false
        });

        let averageRating = 0;
        let totalReviews = reviews.length;

        if (totalReviews > 0) {
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / totalReviews;
        }

        return {
          ...product,
          averageRating: averageRating,
          totalReviews: totalReviews
        };
      })
    );

    return res.render("dashboard", { products: productsWithRatings });
  } catch (error) {
    console.error('Error loading landing page:', error);
    res.status(500).send("Server error");
  }
};



const loadSignup = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    console.error("Signup page not loading", error);
    res.status(500).send("Server Error");
  }
};

const signup = async (req, res) => {
  try {
    const { fullname, phone, email, password, referralCode } = req.body;

    if (!fullname || fullname.length < 4) {
      return res.status(400).json({ success: false, message: "Full name must be at least 4 characters" });
    }

    if (/\d/.test(fullname)) {
      return res.status(400).json({ success: false, message: "Full name should not contain numbers" });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Phone number must be 10 digits and start with 6, 7, 8, or 9" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(403).json({
        success: false,
        message: "User already exists",
      });
    }

    const otp = generateOtp();
    console.log("otp is:", otp);

    const isSendMail = await sendEmail(email, otp);

    if (!isSendMail) {
      return res.json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    let userReferralCode;
    let isReferralCodeUnique = false;
    
    while (!isReferralCodeUnique) {
      userReferralCode = generateReferralCodeWithPrefix('REF', 6);
      const existingUser = await User.findOne({ referralCode: userReferralCode });
      if (!existingUser) {
        isReferralCodeUnique = true;
      }
    }
    
    req.session.userData = { 
      fullname, 
      phone, 
      email, 
      password: hashedPassword, 
      referralCode: userReferralCode,
      referredByCode: referralCode || null 
    };
    req.session.userOtp = otp;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({
          success: false,
          message: "Failed to save session data",
        });
      }
      
      res.json({
        success: true,
        message: "otp sent successfully",
      });
    });
  } catch (error) {
    console.error("Error in loading signup page", error);
    res.status(500).send("Internal server error");
  }
};



const loadOtpPage = async (req, res) => {
  try {
    return res.render("verify-otp");
  } catch (error) {
    console.error("OTP validation page not loading", error);
    res.status(500).send("Internal server error");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    
    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      
      const saveUserData = new User({
        fullname: user.fullname,
        phone: user.phone,
        email: user.email,
        password: user.password,
        referralCode: user.referralCode,
      });

      await saveUserData.save();
      
      try {
        await createWelcomeCoupon(saveUserData._id);
      } catch (couponError) {
        console.error("Error creating welcome coupon:", couponError);
      }
      
      if (user.referredByCode) {
        try {
          const referrer = await User.findOne({ referralCode: user.referredByCode });
          
          if (referrer) {
            const referrerWallet = await Wallet.getOrCreateWallet(referrer._id);
            const newUserWallet = await Wallet.getOrCreateWallet(saveUserData._id);
            
            await referrerWallet.addMoney(
              150, 
              `Referral bonus for referring ${user.fullname}`,
              null
            );
            
            await newUserWallet.addMoney(
              50, 
              `Welcome bonus for using referral code ${user.referredByCode}`,
              null
            );
            
            await createReferralRewardCoupon(referrer._id, user.fullname);
            }
        } catch (referralError) {
          console.error("Error processing referral:", referralError);
        }
      }
      
      res.json({
        success: true,
        redirectUrl: "/login",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid OTP, Please try again",
      });
    }
  } catch (error) {
    console.error("Error Varifying OTP", error);
    res.status(500).json({ success: false, message: `${error.message}` });
  }
};

const resendOtp = async (req, res) => {
  try {
    if (!req.session.userData) {
      return res.status(401).json({ 
        success: false,
        message: "Your session has expired. Please restart the signup process." 
      });
    }

    const { email } = req.session.userData;

    if (!email) {
      return res.status(401).json({ 
        success: false,
        message: "Email not found in session. Please restart the signup process." 
      });
    }

    const otp = generateOtp();
    console.log("otp is:", otp);
    req.session.userOtp = otp;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error during resend:', err);
      }
    });

    const isSendMail = await sendEmail(email, otp);

    if (!isSendMail) {
      return res.json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Error in resending otp:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};



const loadDashboard = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.redirect("/login");
    }

    const filter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    const options = {
      sort: { createdAt: -1 },
      limit: 12
    };

    const productsWithOffers = await getProductsWithBestOffers(filter, options);

    const productsWithRatings = await Promise.all(
      productsWithOffers.map(async (product) => {
        const reviews = await Review.find({
          product: product._id,
          isHidden: false
        });

        let averageRating = 0;
        let totalReviews = reviews.length;

        if (totalReviews > 0) {
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / totalReviews;
        }

        return {
          ...product,
          averageRating: averageRating,
          totalReviews: totalReviews
        };
      })
    );

    return res.render("dashboard", { products: productsWithRatings });
  } catch (error) {
    console.error("Dashboard loading error:", error);
    res.status(500).send("Server Error");
  }
};

const loadLogin = async (req, res) => {
  try {
    return res.render("login");
  } catch (error) {
    console.error("Login page not loading", error);
    res.status(500).send("Server error");
  }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked, Please contact support"
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    req.session.userId = user._id;
    req.session.email = user.email;
    req.session.loginTime = new Date();

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({
          success: false,
          message: "Login failed. Please try again.",
        });
      }

      return res.status(200).redirect('/dashboard');
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during login. Please try again later.",
    });
  }
};

const loadForgotPassword = async (req, res) => {
  try {
    return res.render("forgot-password");
  } catch (error) {
    console.error("Forgot password page not loading", error);
    res.status(500).send("Server Error");
  }
};

const loadForgotVerifyOtp = async (req, res) => {
  try {
    return res.render("forgot-verify-otp");
  } catch (error) {
    console.error("Forgot OTP validation page not loading", error);
    res.status(500).send("Internal server error");
  }
};



const verifyForgotPasswordEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    const otp = generateOtp();
    console.log(`otp is: ${otp}`);

    req.session.userOtp = {
      otp,
      email,
    };

    const isSendMail = await sendEmail(email, otp);
    if (!isSendMail) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Error in verifyForgotEmail:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const resendForgotPasswordOtp = async (req, res) => {
  try {
    const email = req.session.userOtp.email;

    if (!email) {
      return res.status(401).json({ message: "email not found, session ends" });
    }

    const otp = generateOtp();
    console.log("otp is:", otp);

    req.session.userOtp = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      email,
    };

    const isSendMail = await sendEmail(email, otp);

    if (!isSendMail) {
      return res.json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    res.json({
      success: true,
      message: "otp sent successfully",
    });
  } catch (error) {
    console.error("Error in resending otp", error);
    res.status(500).send("Internal server error");
  }
};

const verifyForgotPasswordOtp = (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.userOtp.otp;

    console.log("otp is:", otp);

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: "No OTP session found. Please request again.",
      });
    }
    
    if (String(otp) !== String(sessionOtp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    res.json({
      success: true,
      message: "OTP verified successfully",
      redirectUrl: "/new-password"
    });

  } catch (error) {
    console.error("Error in verifyForgotOtp:", error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

const loadNewPassword = async (req, res) => {
  try {
    return res.render("new-password");
  } catch (error) {
    console.error("New password page not loading", error);
    res.status(500).send("Internal server error");
  }
};



const resetPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.session.userOtp.email;

    const { _id } = await User.findOne({ email });
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await User.findByIdAndUpdate(
      _id,
      { password: hashedPassword },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  loadLanding,
  loadSignup,
  loadLogin,
  loadOtpPage,
  verifyOtp,
  resendOtp,
  signup,
  login,
  loadDashboard,
  loadForgotPassword,
  verifyForgotPasswordEmail,
  verifyForgotPasswordOtp,
  loadForgotVerifyOtp,
  resendForgotPasswordOtp,
  loadNewPassword,
  resetPassword,
};
