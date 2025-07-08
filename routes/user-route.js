const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-auth-controller");
const userProfileController = require("../controllers/user/user-profile-controller");
const userShopController = require("../controllers/user/user-shop-controller");
const userUtilityController = require("../controllers/user/user-utility-controller");
const userProductController = require("../controllers/user/product-controller");
const addressController = require("../controllers/user/address-controller");
const orderController = require("../controllers/user/order-controller");
const checkoutController = require("../controllers/user/checkout-controller");
const wishlistController = require("../controllers/user/wishlist-controller");
const cartController = require("../controllers/user/cart-controller");
const { checkProductAvailabilityForPage, checkProductAvailability, checkProductAvailabilityForWishlist } = require("../middleware/product-availability-middleware");
const { profileUpload, handleMulterError } = require("../config/multer-config");

const { isUserAuthenticated, preventCache, redirectIfAuthenticated, validateSession } = require("../middleware/auth-middleware");
const { addUserContext, checkUserBlocked } = require("../middleware/user-middleware");


// Google OAuth routes
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/signup" }),(req, res) => {
    // Regenerate session for security
    req.session.regenerate((err) => {
      if (err) {
        console.error('Google OAuth session regeneration error:', err);
        return res.redirect('/login?error=session');
      }
      // Set user session data
      req.session.userId = req.user._id;
      req.session.email = req.user.email;
      req.session.loginTime = new Date();
      req.session.googleUserId = req.user._id; // For Google OAuth identification
      // Save session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('Google OAuth session save error:', err);
          return res.redirect('/login?error=session');
        }
        res.redirect("/dashboard");
      });
    });
  }
);

// Landing page - redirect authenticated users to dashboard
router.get("/", preventCache, redirectIfAuthenticated, validateSession, addUserContext, checkUserBlocked, userController.loadLanding);
// Public routes - redirect authenticated users away from login/signup
router.get("/signup", preventCache, redirectIfAuthenticated, validateSession, userController.loadSignup);
router.get("/login", preventCache, redirectIfAuthenticated, validateSession, userController.loadLogin);
router.post("/signup", redirectIfAuthenticated, userController.signup);
router.post("/validate-referral-code", redirectIfAuthenticated, userUtilityController.validateReferralCode);

router.get("/verify-otp", preventCache, redirectIfAuthenticated, userController.loadOtpPage);
router.post("/verify-otp", redirectIfAuthenticated, userController.verifyOtp);
router.post("/resend-otp", redirectIfAuthenticated, userController.resendOtp);
router.post("/login", redirectIfAuthenticated, userController.login);

// Forgot password routes - redirect authenticated users
router.get("/forgot-password", preventCache, redirectIfAuthenticated, validateSession, userController.loadForgotPassword);
router.post("/forgot-password", redirectIfAuthenticated, userController.verifyForgotPasswordEmail);
router.get("/forgot-verify-otp", preventCache, redirectIfAuthenticated, validateSession, userController.loadForgotVerifyOtp);
router.post("/forgot-verify-otp", redirectIfAuthenticated, userController.verifyForgotPasswordOtp);
router.post("/resend-forgot-verify-otp", redirectIfAuthenticated, userController.resendForgotPasswordOtp);
router.get("/new-password", preventCache, redirectIfAuthenticated, validateSession, userController.loadNewPassword);
router.post("/reset-password", redirectIfAuthenticated, userController.resetPassword);


// Dashboard - requires authentication
router.get("/dashboard", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadDashboard);
router.get("/shop", validateSession, addUserContext, checkUserBlocked, userShopController.loadShop);
router.get("/products", validateSession, addUserContext, checkUserBlocked, userShopController.loadShop);
router.get("/product/:id", validateSession, addUserContext, checkUserBlocked, checkProductAvailabilityForPage, userShopController.loadProductDetails);
router.get("/profile", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadProfile);
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.logout);

// Product-related routes
router.post("/product/:id/review", isUserAuthenticated, preventCache, checkUserBlocked, userShopController.submitReview);
router.post("/product/:id/review/:reviewId/helpful", isUserAuthenticated, preventCache, checkUserBlocked, userShopController.markHelpful);
router.get("/product/:id/status", isUserAuthenticated, preventCache, checkUserBlocked, userShopController.checkProductStatus);

// API routes for products with offers
router.get("/api/products", validateSession, addUserContext, checkUserBlocked, userProductController.getProducts);
router.get("/api/products/featured", validateSession, addUserContext, checkUserBlocked, userProductController.getFeaturedProducts);
router.get("/api/products/search", validateSession, addUserContext, checkUserBlocked, userProductController.searchProducts);
router.get("/api/products/:id", validateSession, addUserContext, checkUserBlocked, userProductController.getProductById);
router.get("/api/category/:categoryId/products", validateSession, addUserContext, checkUserBlocked, userProductController.getProductsByCategory);
// Profile-related routes
router.get("/profile/edit", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadEditProfile);
router.post("/profile/edit", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.updateProfileData);
router.post("/profile/verify-current-email", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.verifyCurrentEmail);
router.get("/profile/email-change-otp", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadEmailChangeOtp);
router.post("/profile/email-change-otp", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.verifyEmailChangeOtp);
router.post("/profile/change-email", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.changeEmail);
router.post("/profile/update", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.updateProfile);
router.post("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, profileUpload.single('profilePhoto'), handleMulterError, userProfileController.uploadProfilePhoto);
router.delete("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.deleteProfilePhoto);
// Address-related routes
router.get("/address", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressList);
router.get("/address/add", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.get("/address/edit/:id", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.post("/address", isUserAuthenticated, preventCache, checkUserBlocked, addressController.saveAddress);
router.put("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.updateAddress);
router.put("/address/set-default/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.setAsDefault);
router.delete("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.deleteAddress);
// Order-related routes
router.get("/orders", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, orderController.loadOrderList);
router.get("/order-details/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, orderController.loadOrderDetails);
router.post("/orders/:orderId/items/:itemId/cancel", isUserAuthenticated, preventCache, checkUserBlocked, orderController.cancelOrderItem);
router.post("/orders/:orderId/cancel-entire", isUserAuthenticated, preventCache, checkUserBlocked, orderController.cancelEntireOrder);
router.post("/orders/:orderId/request-return", isUserAuthenticated, preventCache, checkUserBlocked, orderController.requestReturn);
router.post("/orders/:orderId/items/:itemId/request-return", isUserAuthenticated, preventCache, checkUserBlocked, orderController.requestIndividualItemReturn);
router.get("/orders/:orderId/download-invoice", isUserAuthenticated, preventCache, checkUserBlocked, orderController.downloadInvoice);
// Wishlist-related routes
router.get("/wishlist", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, wishlistController.loadWishlist);
router.post("/wishlist/add", isUserAuthenticated, preventCache, checkUserBlocked, checkProductAvailabilityForWishlist, wishlistController.addToWishlist);
router.post("/wishlist/remove", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.removeFromWishlist);
router.get("/wishlist/count", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.getWishlistCount);
router.post("/wishlist/bulk-transfer-to-cart", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.bulkTransferToCart);
// Wallet route
router.get("/wallet", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadWallet);
// Coupon page route
router.get("/coupon", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userUtilityController.loadCouponPage);
// Referrals page route
router.get("/referrals", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userUtilityController.loadReferrals);
// Change password route
router.get("/change-password", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadChangePassword);
router.post("/change-password", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.updatePassword);
// Checkout-related routes
router.get("/checkout", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadCheckout);
router.post("/checkout/apply-coupon", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.applyCoupon);
router.post("/checkout/remove-coupon", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.removeCoupon);
router.post("/checkout/place-order", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.placeOrder);
router.post("/checkout/create-razorpay-order", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.createRazorpayOrder);
router.post("/checkout/verify-payment", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.verifyPayment);
router.post("/checkout/payment-failed", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.paymentFailed);
router.get("/checkout/retry-payment/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadRetryPayment);
router.get("/order-success/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadOrderSuccess);
router.get("/order-failure/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadOrderFailure);
// Cart-related routes
router.get("/cart", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, cartController.loadCart);
router.post("/add-to-cart", isUserAuthenticated, preventCache, checkUserBlocked, cartController.addToCart);
router.post("/cart/update", isUserAuthenticated, preventCache, checkUserBlocked, cartController.updateCartQuantity);
router.post("/cart/remove", isUserAuthenticated, preventCache, checkUserBlocked, cartController.removeFromCart);
router.post("/cart/clear", isUserAuthenticated, preventCache, checkUserBlocked, cartController.clearCart);
router.post("/cart/remove-out-of-stock", isUserAuthenticated, preventCache, checkUserBlocked, cartController.removeOutOfStockItems);
router.get("/cart/validate", isUserAuthenticated, preventCache, checkUserBlocked, cartController.validateCartItems);
router.get("/cart/count", isUserAuthenticated, preventCache, checkUserBlocked, cartController.getCartCount);
// About and Contact page routes
router.get("/about", validateSession, addUserContext, checkUserBlocked, userUtilityController.loadAbout);
router.get("/contact", validateSession, addUserContext, checkUserBlocked, userUtilityController.loadContact);
router.post("/contact", validateSession, addUserContext, checkUserBlocked, userUtilityController.submitContact);

module.exports = router;
