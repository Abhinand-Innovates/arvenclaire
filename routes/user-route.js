const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-auth-controller");
const { addUserContext, checkUserBlocked } = require("../middleware/user-middleware");
const { checkProductAvailabilityForPage } = require("../middleware/product-availability-middleware");
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
router.get("/", addUserContext, checkUserBlocked, userController.loadLanding);
router.get("/dashboard", addUserContext, checkUserBlocked, userController.loadDashboard);
router.get("/shop", addUserContext, checkUserBlocked, userController.loadShop);
router.get("/products", addUserContext, checkUserBlocked, userController.loadShop);
router.get("/product/:id", addUserContext, checkUserBlocked, checkProductAvailabilityForPage, userController.loadProductDetails);
router.get("/profile", addUserContext, checkUserBlocked, userController.loadProfile);
router.get("/settings", addUserContext, checkUserBlocked, userController.loadSettings);
router.get("/logout", checkUserBlocked, userController.logout);


// Review routes
router.post("/submit-review", checkUserBlocked, userController.submitReview);
router.post("/mark-helpful", checkUserBlocked, userController.markHelpful);

// Profile photo upload route
router.post("/upload-profile-photo", checkUserBlocked, profileUpload.single('profilePhoto'), handleMulterError, userController.uploadProfilePhoto);

// API routes
router.get("/api/product-status/:id", checkUserBlocked, userController.checkProductStatus);



module.exports = router;