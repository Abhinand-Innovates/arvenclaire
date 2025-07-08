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
    // Get products with best offers applied
    const filter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    const options = {
      sort: { createdAt: -1 },
      limit: 12 // Limit for landing page
    };

    const productsWithOffers = await getProductsWithBestOffers(filter, options);

    // Calculate average ratings for each product
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

    // User context is automatically added by middleware
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
    console.log("Home page not loading", error);
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
    
    // Generate unique referral code for the new user
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

    // Explicitly save the session
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
    console.log("otp-validation page not loading");
    res.status(500).send("Internal server error");
  }
};



const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    
    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      
      // Create new user with referral code
      const saveUserData = new User({
        fullname: user.fullname,
        phone: user.phone,
        email: user.email,
        password: user.password,
        referralCode: user.referralCode,
      });

      await saveUserData.save();
      
      // Create welcome coupon for the new user
      try {
        await createWelcomeCoupon(saveUserData._id);
      } catch (couponError) {
        console.error("Error creating welcome coupon:", couponError);
        // Don't fail the signup process if coupon creation fails
      }
      
      // Process referral if referral code was provided
      if (user.referredByCode) {
        try {
          // Find the user who referred this new user
          const referrer = await User.findOne({ referralCode: user.referredByCode });
          
          if (referrer) {
            // Create or get wallets for both users
            const referrerWallet = await Wallet.getOrCreateWallet(referrer._id);
            const newUserWallet = await Wallet.getOrCreateWallet(saveUserData._id);
            
            // Credit 150 rupees to referrer's wallet
            await referrerWallet.addMoney(
              150, 
              `Referral bonus for referring ${user.fullname}`,
              null
            );
            
            // Credit 50 rupees to new user's wallet
            await newUserWallet.addMoney(
              50, 
              `Welcome bonus for using referral code ${user.referredByCode}`,
              null
            );
            
            // Create referral reward coupon for the referrer
            await createReferralRewardCoupon(referrer._id, user.fullname);
            
            }
        } catch (referralError) {
          console.error("Error processing referral:", referralError);
          // Don't fail the signup process if referral processing fails
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

    // otp Generation
    const otp = generateOtp();
    console.log("otp is:", otp);
    req.session.userOtp = otp;

    // Save session after updating OTP
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
    
    // This check is redundant since isUserAuthenticated middleware handles it,
    // but keeping for extra safety
    if (!userId) {
      return res.redirect("/login");
    }

    // Get products with best offers applied
    const filter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    const options = {
      sort: { createdAt: -1 },
      limit: 12 // Limit for dashboard
    };

    const productsWithOffers = await getProductsWithBestOffers(filter, options);

    // Calculate average ratings for each product
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

    // User context is automatically added by middleware
    return res.render("dashboard", { products: productsWithRatings });
  } catch (error) {
    console.log("Dashboard loading error:", error);
    res.status(500).send("Server Error");
  }
};



const loadLogin = async (req, res) => {
  try {
    return res.render("login");
  } catch (error) {
    console.log("Login page not loading", error);
    res.status(500).send("Server error");
  }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
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

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Regenerate session for security
    // req.session.regenerate((err) => {
    //   if (err) {
    //     console.error('Session regeneration error:', err);
    //     return res.status(500).json({
    //       success: false,
    //       message: "Login failed. Please try again.",
    //     });
    //   }

      // Set user session data
      req.session.userId = user._id;
      req.session.email = user.email;
      req.session.loginTime = new Date();

      // Save session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({
            success: false,
            message: "Login failed. Please try again.",
          });
        }

        // Redirect to dashboard
        return res.status(200).redirect('/dashboard');
      });
    // });

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
    console.log("Verify email page not loading", error);
    res.status(500).send("Server Error");
  }
};



const loadForgotVerifyOtp = async (req, res) => {
  try {
    return res.render("forgot-verify-otp");
  } catch (error) {
    console.log("otp-validation page not loading");
    res.status(500).send("Internal server error");
  }
};



// Send OTP for Forgot Password
const verifyForgotPasswordEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    // Generate OTP
    const otp = generateOtp();
    console.log(`otp is: ${otp}`);

    // Store OTP in session
    req.session.userOtp = {
      otp,
      email,
    };

    // Send OTP via email
    const isSendMail = await sendEmail(email, otp);
    if (!isSendMail) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    // Send success response
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

    // otp Generation
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



// Verify OTP
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
    
    // Ensure OTP comparison handles string/number types
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
    console.log("New password page not loading");
    res.status(500).send("Internal server error");
  }
};



const resetPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.session.userOtp.email;

    const { _id } = await User.findOne({ email });

    
    // 1. Validate passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // 2. Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3. Update user password
    const user = await User.findByIdAndUpdate(
      _id,
      { password: hashedPassword },
      { new: true }
    );

    // 4. Handle user not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 5. Send success response
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
