const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-auth-controller");
const addressController = require("../controllers/user/address-controller");
const orderController = require("../controllers/user/order-controller");
const wishlistController = require("../controllers/user/wishlist-controller");
const cartController = require("../controllers/user/cart-controller");
const { checkProductAvailabilityForPage, checkProductAvailability, checkProductAvailabilityForWishlist } = require("../middleware/product-availability-middleware");
const { profileUpload, handleMulterError } = require("../config/multer-config");

const { isUserAuthenticated, preventCache } = require("../middleware/auth-middleware");
const { addUserContext, checkUserBlocked } = require("../middleware/user-middleware");


// Google OAuth routes
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.userId = req.user._id;
    res.redirect("/dashboard");
  }
);


// Public routes (with user context for navbar)
router.get("/signup", addUserContext, userController.loadSignup);
router.get("/login", addUserContext, userController.loadLogin);
router.post("/signup", userController.signup);

router.get("/verify-otp", userController.loadOtpPage);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.post("/login", userController.login);

// Forgot password routes (no user context needed)
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.verifyForgotPasswordEmail);
router.get("/forgot-verify-otp", userController.loadForgotVerifyOtp);
router.post("/forgot-verify-otp", userController.verifyForgotPasswordOtp);
router.post("/resend-forgot-verify-otp", userController.resendForgotPasswordOtp);
router.get("/new-password", userController.loadNewPassword);
router.post("/reset-password", userController.resetPassword);

// Routes that need user context for dropdown (apply middleware)
router.get("/", addUserContext, checkUserBlocked, userController.loadLanding);
router.get("/dashboard", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadDashboard);
router.get("/shop", addUserContext, checkUserBlocked, userController.loadShop);
router.get("/products", addUserContext, checkUserBlocked, userController.loadShop);
router.get("/product/:id", addUserContext, checkUserBlocked, checkProductAvailabilityForPage, userController.loadProductDetails);
router.get("/profile", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadProfile);
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userController.logout);

// Product-related routes
router.post("/product/:id/review", isUserAuthenticated, preventCache, checkUserBlocked, userController.submitReview);
router.post("/product/:id/review/:reviewId/helpful", isUserAuthenticated, preventCache, checkUserBlocked, userController.markHelpful);
router.get("/product/:id/status", isUserAuthenticated, preventCache, checkUserBlocked, userController.checkProductStatus);
// Profile-related routes
router.get("/profile/edit", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadEditProfile);
router.post("/profile/edit", isUserAuthenticated, preventCache, checkUserBlocked, userController.updateProfileData);
router.post("/profile/verify-current-email", isUserAuthenticated, preventCache, checkUserBlocked, userController.verifyCurrentEmail);
router.get("/profile/email-change-otp", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadEmailChangeOtp);
router.post("/profile/email-change-otp", isUserAuthenticated, preventCache, checkUserBlocked, userController.verifyEmailChangeOtp);
router.post("/profile/change-email", isUserAuthenticated, preventCache, checkUserBlocked, userController.changeEmail);
router.post("/profile/update", isUserAuthenticated, preventCache, checkUserBlocked, userController.updateProfile);
router.post("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, profileUpload.single('profilePhoto'), handleMulterError, userController.uploadProfilePhoto);
router.delete("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, userController.deleteProfilePhoto);

// Address-related routes
router.get("/address", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressList);
router.get("/address/add", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.get("/address/edit/:id", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.post("/address", isUserAuthenticated, preventCache, checkUserBlocked, addressController.saveAddress);
router.put("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.updateAddress);
router.delete("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.deleteAddress);

// Order-related routes
router.get("/orders", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, orderController.loadOrderList);

// Cart-related routes
router.get("/cart", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, cartController.loadCart);
router.post("/add-to-cart", isUserAuthenticated, preventCache, checkUserBlocked, cartController.addToCart);
router.post("/cart/update", isUserAuthenticated, preventCache, checkUserBlocked, cartController.updateCartQuantity);
router.post("/cart/remove", isUserAuthenticated, preventCache, checkUserBlocked, cartController.removeFromCart);
router.post("/cart/clear", isUserAuthenticated, preventCache, checkUserBlocked, cartController.clearCart);
router.get("/cart/count", isUserAuthenticated, preventCache, checkUserBlocked, cartController.getCartCount);

// Wishlist-related routes
router.get("/wishlist", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, wishlistController.loadWishlist);
router.post("/wishlist/add", isUserAuthenticated, preventCache, checkUserBlocked, checkProductAvailabilityForWishlist, wishlistController.addToWishlist);
router.post("/wishlist/remove", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.removeFromWishlist);
router.get("/wishlist/count", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.getWishlistCount);

// Change password route
router.get("/change-password", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadChangePassword);
router.post("/change-password", isUserAuthenticated, preventCache, checkUserBlocked, userController.updatePassword);

// Wallet route
router.get("/wallet", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadWallet);



module.exports = router;