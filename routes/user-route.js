const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-controller");
const addUserContext = require("../middleware/user-context");
const { checkProductAvailabilityForPage } = require("../middleware/product-availability");
const { profileUpload, handleMulterError } = require("../config/multer-config");



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
router.get("/", addUserContext, userController.loadLanding);
router.get("/dashboard", addUserContext, userController.loadDashboard);
router.get("/shop", addUserContext, userController.loadShop);
router.get("/products", addUserContext, userController.loadShop);
router.get("/product/:id", addUserContext, checkProductAvailabilityForPage, userController.loadProductDetails);
router.get("/profile", addUserContext, userController.loadProfile);
router.get("/settings", addUserContext, userController.loadSettings);
router.get("/logout", userController.logout);


// Review routes
router.post("/submit-review", userController.submitReview);
router.post("/mark-helpful", userController.markHelpful);

// Profile photo upload route
router.post("/upload-profile-photo", profileUpload.single('profilePhoto'), handleMulterError, userController.uploadProfilePhoto);

// API routes
router.get("/api/product-status/:id", userController.checkProductStatus);



module.exports = router;