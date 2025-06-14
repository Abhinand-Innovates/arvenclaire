const User = require("../../models/user-schema");
const generateOtp = require("../../utils/generateOtp");
const sendEmail = require("../../utils/sendEmail");
const bcrypt = require("bcrypt");
const Product = require("../../models/product-schema");
const Category = require("../../models/category-schema");
const Review = require("../../models/review-schema");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");



const loadLanding = async (req, res) => {
  try {
    // Only show available, non-blocked, listed products with listed categories
    const products = await Product.find({
      isDeleted: false,
      isBlocked: false,
      isListed: true
    }).populate({
      path: 'category',
      match: { isListed: true },
      select: 'name'
    }).sort({ createdAt: -1 }).lean();

    // Filter out products with unlisted categories (populate returns null for unmatched)
    const filteredProducts = products.filter(product => product.category !== null);

    // Calculate average ratings for each product
    const productsWithRatings = await Promise.all(
      filteredProducts.map(async (product) => {
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



const signup = async (req, res) => {
  try {
    const { fullname, phone, email, password } = req.body;

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
    console.log(`otp is: ${otp}`);

    const isSendMail = await sendEmail(email, otp);

    if (!isSendMail) {
      return res.json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    req.session.userData = { fullname, phone, email, password: hashedPassword };
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
    console.log(`otp is: ${otp}`);
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



const loadDashboard = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId) {
      // Only show available, non-blocked, listed products with listed categories
      const products = await Product.find({
        isDeleted: false,
        isBlocked: false,
        isListed: true
      }).populate({
        path: 'category',
        match: { isListed: true },
        select: 'name'
      }).sort({ createdAt: -1 }).lean();

      // Filter out products with unlisted categories (populate returns null for unmatched)
      const filteredProducts = products.filter(product => product.category !== null);

      // Calculate average ratings for each product
      const productsWithRatings = await Promise.all(
        filteredProducts.map(async (product) => {
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
    } else {
      return res.redirect("/");
    }
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
      res.status(401).json({ message: "email not found, session ends" });
    }

    // otp Generation
    const otp = generateOtp();
    console.log(`otp is: ${otp}`);

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


// Load profile page
const loadProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data
    const user = await User.findById(userId).select('-password').lean();

    if (!user) {
      return res.redirect('/login');
    }

    res.render('profile', {
      title: 'My Profile',
      user: user
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.status(500).send('Server Error');
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
    const Category = require('../../models/category-schema');

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

    // Get categories for filter dropdown
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

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

    // Add comprehensive search filter
    if (searchQuery) {
      searchFilter.$or = [
        { productName: { $regex: searchQuery, $options: 'i' } },
        { brand: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { features: { $regex: searchQuery, $options: 'i' } }
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

    // Fetch products with category filtering
    const [allProducts, totalProductsBeforeFilter] = await Promise.all([
      Product.find(searchFilter)
        .populate({
          path: 'category',
          match: { isListed: true },
          select: 'name'
        })
        .sort(sortQuery)
        .lean(),
      Product.countDocuments(searchFilter)
    ]);

    // Filter out products with unlisted categories (populate returns null for unmatched)
    const filteredProducts = allProducts.filter(product => product.category !== null);

    // Apply pagination to filtered products
    const totalProducts = filteredProducts.length;
    const products = filteredProducts.slice(skip, skip + limit);

    // Calculate average ratings for each product
    const productsWithRatings = await Promise.all(
      products.map(async (product) => {
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

    // Check for redirect message from blocked product access
    const redirectMessage = req.session.redirectMessage;
    if (redirectMessage) {
      delete req.session.redirectMessage; // Clear the message after reading
    }

    res.render('shop', {
      products: productsWithRatings,
      categories,
      redirectMessage, // Pass the redirect message to the view
      // User context is automatically added by middleware
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
      message: 'Failed to load shop page'
      // User context is automatically added by middleware
    });
  }
};




// Load product details page
const loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    // Product availability is already checked by middleware
    // Get product details with populated category
    const product = await Product.findById(productId)
      .populate('category')
      .lean();

    // Get reviews for this product
    const reviews = await Review.find({
      product: productId,
      isHidden: false
    })
    .populate('user', 'fullname')
    .sort({ createdAt: -1 })
    .lean();

    // Get related products from the same category (excluding current product)
    // Only show if the category is listed
    let relatedProductsRaw = [];
    if (product.category && product.category.isListed) {
      relatedProductsRaw = await Product.find({
        category: product.category._id,
        _id: { $ne: productId }, // Exclude current product
        isDeleted: false,
        isBlocked: false,
        isListed: true
      })
      .populate({
        path: 'category',
        match: { isListed: true },
        select: 'name'
      })
      .sort({ createdAt: -1 })
      .limit(4) // Show up to 4 related products
      .lean();

      // Filter out products with unlisted categories
      relatedProductsRaw = relatedProductsRaw.filter(product => product.category !== null);
    }

    // Calculate average ratings for related products
    const relatedProducts = await Promise.all(
      relatedProductsRaw.map(async (relatedProduct) => {
        const reviews = await Review.find({
          product: relatedProduct._id,
          isHidden: false
        });

        let averageRating = 0;
        let totalReviews = reviews.length;

        if (totalReviews > 0) {
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / totalReviews;
        }

        return {
          ...relatedProduct,
          averageRating: averageRating,
          totalReviews: totalReviews
        };
      })
    );

    // Calculate review statistics
    const totalReviews = reviews.length;
    let averageRating = 0;
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      averageRating = totalRating / totalReviews;

      // Count ratings
      reviews.forEach(review => {
        ratingCounts[review.rating]++;
      });

      // Calculate percentages
      Object.keys(ratingBreakdown).forEach(rating => {
        ratingBreakdown[rating] = totalReviews > 0
          ? (ratingCounts[rating] / totalReviews) * 100
          : 0;
      });
    }

    res.render('product-details', {
      product,
      reviews,
      relatedProducts,
      // User context is automatically added by middleware
      averageRating,
      totalReviews,
      ratingCounts,
      ratingBreakdown
    });

  } catch (error) {
    console.error('Error loading product details:', error);
    res.status(500).render('error', {
      message: 'Internal server error'
      // User context is automatically added by middleware
    });
  }
};



// Submit Review
const submitReview = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to submit a review'
      });
    }

    // Get productId from route params
    const productId = req.params.id;
    const { rating, title, comment } = req.body;

    // Validate input
    if (!rating || !title || !comment) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      user: userId,
      product: productId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Create new review
    const newReview = new Review({
      user: userId,
      product: productId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim()
    });

    await newReview.save();

    res.json({
      success: true,
      message: 'Review submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};



// Mark Review as Helpful
const markHelpful = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to mark reviews as helpful'
      });
    }

    // Get reviewId from route params
    const reviewId = req.params.reviewId;

    if (!reviewId) {
      return res.status(400).json({
        success: false,
        message: 'Review ID is required'
      });
    }

    // Find and update review
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { helpfulVotes: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      message: 'Marked as helpful',
      helpfulVotes: review.helpfulVotes
    });

  } catch (error) {
    console.error('Error marking review as helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as helpful'
    });
  }
};




// Upload profile photo
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to upload profile photo'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `profile_${userId}_${timestamp}.jpg`;
    const filepath = path.join(__dirname, '../../public/uploads/profiles', filename);

    // Process and save the image using Sharp
    await sharp(req.file.buffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(filepath);

    // Get current user to check for existing profile photo
    const currentUser = await User.findById(userId);

    // Delete old profile photo if it exists
    if (currentUser.profilePhoto) {
      const oldPhotoPath = path.join(__dirname, '../../public/uploads/profiles', currentUser.profilePhoto);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    // Update user with new profile photo
    await User.findByIdAndUpdate(userId, {
      profilePhoto: filename
    });

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      filename: filename
    });

  } catch (error) {
    console.error('Error uploading profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile photo'
    });
  }
};

// Delete profile photo
const deleteProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to delete profile photo'
      });
    }

    // Get current user to check for existing profile photo
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!currentUser.profilePhoto) {
      return res.status(400).json({
        success: false,
        message: 'No profile photo to delete'
      });
    }

    // Delete the physical file
    const photoPath = path.join(__dirname, '../../public/uploads/profiles', currentUser.profilePhoto);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    // Update user to remove profile photo
    await User.findByIdAndUpdate(userId, {
      $unset: { profilePhoto: 1 }
    });

    res.json({
      success: true,
      message: 'Profile photo deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile photo'
    });
  }
};



// API endpoint to check product availability status
const checkProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId).populate('category', 'isListed isDeleted');

    if (!product) {
      return res.json({
        success: false,
        available: false,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Check if product's category is available
    let isCategoryAvailable = true;
    let categoryUnavailableReason = null;

    if (product.category) {
      if (product.category.isDeleted) {
        isCategoryAvailable = false;
        categoryUnavailableReason = 'CATEGORY_DELETED';
      } else if (!product.category.isListed) {
        isCategoryAvailable = false;
        categoryUnavailableReason = 'CATEGORY_UNLISTED';
      }
    }

    // Determine availability and specific reason
    let isAvailable = true;
    let unavailableReason = null;

    if (product.isDeleted) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_DELETED';
    } else if (product.isBlocked) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_BLOCKED';
    } else if (!product.isListed) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_UNLISTED';
    } else if (!isCategoryAvailable) {
      isAvailable = false;
      unavailableReason = categoryUnavailableReason;
    }

    res.json({
      success: true,
      available: isAvailable,
      code: unavailableReason,
      status: {
        isBlocked: product.isBlocked,
        isDeleted: product.isDeleted,
        isListed: product.isListed,
        categoryListed: isCategoryAvailable,
        stock: product.quantity,
        isInStock: product.quantity > 0
      }
    });

  } catch (error) {
    console.error('Error checking product status:', error);
    res.status(500).json({
      success: false,
      available: false,
      message: 'Internal server error',
      code: 'SERVER_ERROR'
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

  loadProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  logout,
  loadShop,
  loadProductDetails,
  submitReview,
  markHelpful,
  checkProductStatus,

};
