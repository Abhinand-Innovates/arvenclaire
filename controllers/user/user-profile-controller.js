const User = require("../../models/user-schema");
const generateOtp = require("../../utils/generateOtp");
const sendEmail = require("../../utils/sendEmail");
const bcrypt = require("bcrypt");
const Order = require('../../models/order-schema');
const Wishlist = require('../../models/wishlist-schema');
const Wallet = require('../../models/wallet-schema');
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

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

    // Get total orders count
    const totalOrders = await Order.countDocuments({ userId: userId });

    // Get wishlist items count
    const wishlistCount = await Wishlist.countDocuments({ userId: userId });

    // Get wallet balance from Wallet model
    const wallet = await Wallet.getOrCreateWallet(userId);
    const walletBalance = wallet.balance || 0;

    // Available coupons (placeholder for now)
    const availableCoupons = 0;

    res.render('profile', {
      title: 'My Profile',
      user: user,
      stats: {
        totalOrders,
        wishlistCount,
        walletBalance,
        availableCoupons
      }
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.status(500).send('Server Error');
  }
};

// Load edit profile page
const loadEditProfile = async (req, res) => {
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

    res.render('edit-profile', {
      title: 'Edit Profile',
      user: user
    });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.status(500).send('Server Error');
  }
};

// Load change password page
const loadChangePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    res.render('change-password', {
      user,
      title: 'Change Password'
    });
  } catch (error) {
    console.error('Error loading change password page:', error);
    res.status(500).render('error', { message: 'Error loading change password page' });
  }
};

// Load wallet page
const loadWallet = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get wallet data
    const Wallet = require('../../models/wallet-schema');
    const wallet = await Wallet.getOrCreateWallet(userId);

    // Calculate wallet statistics
    const totalAdded = wallet.transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSpent = wallet.transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Get recent transactions (last 10)
    const recentTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    res.render('wallet', {
      user,
      title: 'My Wallet',
      wallet: {
        balance: wallet.balance,
        totalAdded,
        totalSpent,
        transactions: recentTransactions
      }
    });
  } catch (error) {
    console.error('Error loading wallet page:', error);
    res.status(500).render('error', { message: 'Error loading wallet page' });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to update profile'
      });
    }

    const { fullname, phone } = req.body;
    const errors = {};

    // Validate fullname
    if (!fullname || fullname.trim().length < 4) {
      errors.fullname = 'Full name must be at least 4 characters long';
    } else if (/\d/.test(fullname.trim())) {
      errors.fullname = 'Full name should not contain numbers';
    }

    // Validate phone (optional)
    if (phone && phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim())) {
      errors.phone = 'Phone number must be 10 digits and start with 6, 7, 8, or 9';
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Check if user exists
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user profile
    const updateData = {
      fullname: fullname.trim()
    };

    // Only update phone if provided
    if (phone && phone.trim()) {
      updateData.phone = phone.trim();
    } else if (phone === '') {
      // If empty string is sent, remove phone number
      updateData.phone = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating profile:', error);

    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Update profile data (excluding email)
const updateProfileData = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to update profile'
      });
    }

    const { fullname, phone } = req.body;
    const errors = {};

    // Validate fullname
    if (!fullname || fullname.trim().length < 4) {
      errors.fullname = 'Full name must be at least 4 characters long';
    } else if (/\d/.test(fullname.trim())) {
      errors.fullname = 'Full name should not contain numbers';
    }

    // Validate phone (optional)
    if (phone && phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim())) {
      errors.phone = 'Phone number must be 10 digits and start with 6, 7, 8, or 9';
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Check if user exists
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user profile
    const updateData = {
      fullname: fullname.trim()
    };

    // Only update phone if provided
    if (phone && phone.trim()) {
      updateData.phone = phone.trim();
    } else if (phone === '') {
      // If empty string is sent, remove phone number
      updateData.phone = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating profile:', error);

    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Verify current email for email change
const verifyCurrentEmail = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentEmail } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to verify email'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current email
    if (user.email !== currentEmail.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Current email is incorrect'
      });
    }

    // Generate OTP for email change
    const otp = generateOtp();
    console.log(`Email change OTP: ${otp}`);

    // Store OTP in session for email change
    req.session.emailChangeOtp = {
      otp,
      email: user.email,
      userId: userId,
      expiresAt: Date.now() + 45 * 1000 // 45 seconds
    };

    // Send OTP to current email
    const isSendMail = await sendEmail(user.email, otp);
    if (!isSendMail) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }

    res.json({
      success: true,
      message: 'OTP sent to your current email address'
    });

  } catch (error) {
    console.error('Error verifying current email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email'
    });
  }
};

// Load email change OTP page
const loadEmailChangeOtp = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    // Check if email change session exists
    if (!req.session.emailChangeOtp) {
      return res.redirect('/profile/edit');
    }

    // Get user data
    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.redirect('/login');
    }

    res.render('email-change-otp', {
      title: 'Verify Email Change',
      user: user,
      email: req.session.emailChangeOtp.email
    });
  } catch (error) {
    console.error('Error loading email change OTP page:', error);
    res.status(500).send('Server Error');
  }
};

// Verify OTP for email change
const verifyEmailChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP session found. Please start the email change process again.'
      });
    }

    // Check if OTP expired
    if (Date.now() > sessionOtp.expiresAt) {
      req.session.emailChangeOtp = null;
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please start the email change process again.'
      });
    }

    // Verify OTP
    if (String(otp) !== String(sessionOtp.otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Mark OTP as verified
    req.session.emailChangeOtp.verified = true;

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Error verifying email change OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Change email address
const changeEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp || !sessionOtp.verified) {
      return res.status(400).json({
        success: false,
        message: 'Email change not authorized. Please verify OTP first.'
      });
    }

    // Validate new email
    if (!newEmail || !newEmail.trim()) {
      return res.status(400).json({
        success: false,
        message: 'New email is required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({
      email: newEmail.toLowerCase().trim(),
      _id: { $ne: sessionOtp.userId }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This email address is already registered'
      });
    }

    // Update user email
    const updatedUser = await User.findByIdAndUpdate(
      sessionOtp.userId,
      { email: newEmail.toLowerCase().trim() },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update session email
    req.session.email = newEmail.toLowerCase().trim();

    // Clear email change session
    req.session.emailChangeOtp = null;

    res.json({
      success: true,
      message: 'Email address updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error changing email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email address'
    });
  }
};

// Update password function
const updatePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to change password'
      });
    }

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    // Password requirements validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    if (newPassword.includes(' ')) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot contain spaces'
      });
    }

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
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

// Logout function
const logout = async (req, res) => {
  try {
    // Check if there's an active session
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Destroy session and clear cookies
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error", err);
        return res.status(500).json({
          success: false,
          message: "Failed to logout, Please try again",
        });
      }

      // Clear all session-related cookies
      res.clearCookie("connect.sid");
      
      // Also clear any other potential session cookies
      if (req.cookies) {
        Object.keys(req.cookies).forEach(cookieName => {
          res.clearCookie(cookieName);
        });
      }

      return res.redirect("/login");
    });

  } catch (error) {
    console.error("Logout error", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  loadProfile,
  loadEditProfile,
  loadChangePassword,
  loadWallet,
  updateProfile,
  updateProfileData,
  verifyCurrentEmail,
  loadEmailChangeOtp,
  verifyEmailChangeOtp,
  changeEmail,
  updatePassword,
  uploadProfilePhoto,
  deleteProfilePhoto,
  logout
};