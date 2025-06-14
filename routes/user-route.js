const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-auth-controller");
const { checkProductAvailabilityForPage } = require("../middleware/product-availability-middleware");
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
router.get("/settings", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userController.loadSettings);
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userController.logout);

// Review routes
router.post("/submit-review", isUserAuthenticated, preventCache, checkUserBlocked, userController.submitReview);
router.post("/mark-helpful", isUserAuthenticated, preventCache, checkUserBlocked, userController.markHelpful);

// Profile photo upload route
router.post("/upload-profile-photo", isUserAuthenticated, preventCache, checkUserBlocked, profileUpload.single('profilePhoto'), handleMulterError, userController.uploadProfilePhoto);

// Profile photo delete route
router.delete("/delete-profile-photo", isUserAuthenticated, preventCache, checkUserBlocked, userController.deleteProfilePhoto);

// API routes
router.get("/api/product-status/:id", isUserAuthenticated, preventCache, checkUserBlocked, userController.checkProductStatus);



module.exports = router;