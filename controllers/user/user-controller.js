const User = require("../../models/user-schema");
const generateOtp = require("../../utils/generateOtp");
const sendEmail = require("../../utils/sendEmail");
const bcrypt = require("bcrypt");
const Product = require("../../models/product-schema");





const loadLanding = async (req, res) => {
  try {
    const products = await Product.find()
    return res.render("dashboard",{products});
  } catch (error) {
    console.log("Landing page not loading");
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





const loadLogin = async (req, res) => {
  try {
    return res.render("login");
  } catch (error) {
    console.log("Login page not loading", error);
    res.status(500).send("Server error");
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

    console.log(otp);
    console.log(req.session.userOtp);

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const saveUserData = new User({
        fullname: user.fullname,
        phone: user.phone,
        email: user.email,
        password: user.password,
      });

      await saveUserData.save();
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
    const { email } = req.session.userData;

    if (!email) {
      res.status(401).json({ message: "email not found, session ends" });
    }

    // otp Generation
    const otp = generateOtp();
    req.session.userOtp = otp;

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




const signup = async (req, res) => {
  try {
    const { fullname, phone, email, password } = req.body;

    if (!fullname || fullname.length < 4) {
      return res.status(400).json({ success: false, message: "Full name must be at least 4 characters" });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    if (phone && !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Phone must be 10 digits" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(403).json({
        success: false,
        message: "User already exists",
      });
    }

    // otp Generation
    const otp = generateOtp();
    const isSendMail = await sendEmail(email, otp);

    if (!isSendMail) {
      return res.json({
        success: false,
        message: "Failed to send OTP",
      });
    }
    const hashedPassword = await bcrypt.hash(password,10)
    req.session.userData = { fullname, phone, email, password: hashedPassword};
    req.session.userOtp = otp;

    res.json({
      success: true,
      message: "otp sent successfully",
    });
  } catch (error) {
    console.error("Error in loading signup page", error);
    res.status(500).send("Internal server error");
  }
};

const loadDashboard = async (req, res) => {
  try {
    const user = req.session.userId;
    console.log(user)
    if (user) {
      const userData = await User.findOne({ _id: user });
      const products = await Product.find()
      console.log(products)
      return res.render("dashboard", { user: userData,products });
    } else {
      return res.redirect("/")
    }
  } catch (error) {
    console.log("Home page not loading", error);
    res.status(500).send("Server Error");
  }
};




// const securePassword = async (password) => {
//   try {
//     const passwordHash = await bcrypt.hash(password, 10);
//     return passwordHash;
//   } catch (error) {}
// };




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
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if(user.isBlocked){
      return res.status(403).json({
        success : false,
        message: "Your account is blocked, Please contact support"
      })
    }
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Set user session
    req.session.userId = user._id;
    req.session.email = user.email;

    // Redirect to dashboard
    return res.status(200).redirect('/dashboard');
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
      res.status(401).json({ message: "email not found, session ends" });
    }

    // otp Generation
    const otp = generateOtp();
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

    console.log(otp, sessionOtp)

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: "No OTP session found. Please request again.",
      });
    }

    // if (Date.now() > sessionOtp.expiresAt) {
    //   // Clear expired session data
    //   req.session.userOtp = null;
    //   return res.status(400).json({
    //     success: false,
    //     message: "OTP expired. Please request a new one.",
    //   });
    // }

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

    console.log(_id)

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


const logout = async (req,res) => {

  try {
    if(!req.session.userId) {
      return res.status(400).json({
        success : false,
        message : "No active session to logout from",
      })
    }

    req.session.destroy((err) => {
      if(err) {
        console.error("Session destruction error",err)
        return res.status (500).json({
          success : false,
          message : "Failed to logout, Please try again",
        })
      }


    res.clearCookie("connect.sid");

    // return res.status(200).json({
    //   success : false,
    //   message : "Successfully logged in",
    //   redirectUrl : "/login",
    // })
    return res.status(200).redirect("/login")
  })

  } catch (error) {
    console.error("Logout error",error);
    return res.status(500).json({
      success : false,
      message : "Internal server error",
    })
  }
}
// Load shop page with filtering
const loadShop = async (req, res) => {
  try {
    const user = req.session.userId;
    const Category = require('../../models/category-schema');

    // Check if any filters are applied
    const hasFilters = Object.keys(req.query).length > 0;

    // Get categories for filter dropdown
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    // Get user data if logged in
    let userData = null;
    if (user) {
      userData = await User.findById(user);
    }

    // If no filters applied, show initial state
    if (!hasFilters) {
      return res.render('shop', {
        categories,
        user: userData,
        // Filter data (empty)
        selectedCategory: '',
        search: '',
        sortBy: 'newest',
        minPrice: '',
        maxPrice: ''
      });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 9; // 3 columns × 3 rows = 9 products per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const selectedCategory = req.query.category || '';
    const searchQuery = req.query.search || '';
    const sortBy = req.query.sort || 'newest';
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;

    // Build search query
    const searchFilter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    // Add category filter
    if (selectedCategory) {
      searchFilter.category = selectedCategory;
    }

    // Add search filter
    if (searchQuery) {
      searchFilter.$or = [
        { productName: { $regex: searchQuery, $options: 'i' } },
        { brand: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    // Add price range filter
    if (minPrice !== null || maxPrice !== null) {
      searchFilter.salePrice = {};
      if (minPrice !== null) {
        searchFilter.salePrice.$gte = minPrice;
      }
      if (maxPrice !== null) {
        searchFilter.salePrice.$lte = maxPrice;
      }
    }

    // Build sort query
    let sortQuery = {};
    switch (sortBy) {
      case 'price-low':
        sortQuery = { salePrice: 1 };
        break;
      case 'price-high':
        sortQuery = { salePrice: -1 };
        break;
      case 'name-az':
        sortQuery = { productName: 1 };
        break;
      case 'name-za':
        sortQuery = { productName: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 }; // newest first
    }

    // Fetch products and total count
    const [products, totalProducts] = await Promise.all([
      Product.find(searchFilter)
        .populate('category', 'name')
        .sort(sortQuery)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(searchFilter)
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    const nextPage = hasNextPage ? page + 1 : null;
    const prevPage = hasPrevPage ? page - 1 : null;

    // Generate page numbers for pagination
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // Calculate result range
    const startResult = totalProducts > 0 ? skip + 1 : 0;
    const endResult = Math.min(skip + limit, totalProducts);

    res.render('shop', {
      products,
      categories,
      user: userData,
      // Pagination data
      currentPage: page,
      totalPages,
      totalProducts,
      hasNextPage,
      hasPrevPage,
      nextPage,
      prevPage,
      pageNumbers,
      startResult,
      endResult,
      limit,
      // Filter data
      selectedCategory,
      search: req.query.search || '',
      sortBy,
      minPrice: req.query.minPrice || '',
      maxPrice: req.query.maxPrice || ''
    });

  } catch (error) {
    console.error('Error loading shop page:', error);
    res.status(500).render('error', {
      message: 'Failed to load shop page',
      user: req.session.userId ? await User.findById(req.session.userId) : null
    });
  }
};

// Load product details page
const loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const user = req.session.userId;

    // Get product details
    const Product = require('../../models/product-schema');
    const product = await Product.findById(productId)
      .populate('category', 'name')
      .exec();

    if (!product || product.isDeleted || product.isBlocked) {
      return res.status(404).render('error', {
        message: 'Product not found',
        user: user ? await User.findById(user) : null
      });
    }

    // Get related products (same category, excluding current product)
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isDeleted: false,
      isBlocked: false,
      isListed: true
    })
    .populate('category', 'name')
    .limit(4)
    .sort({ createdAt: -1 });

    // Get user data if logged in
    let userData = null;
    if (user) {
      userData = await User.findById(user);
    }

    res.render('product-details', {
      product,
      relatedProducts,
      user: userData
    });

  } catch (error) {
    console.error('Error loading product details:', error);
    res.status(500).render('error', {
      message: 'Failed to load product details',
      user: req.session.userId ? await User.findById(req.session.userId) : null
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

  logout,
  loadShop,
  loadProductDetails,

};
