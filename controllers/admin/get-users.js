const User = require("../../models/user-schema");

const getUsers = async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Changed to 10 users per page

    // 1. Build dynamic search query
    let searchQuery = {};
    
    // Search by name, email, or phone (case-insensitive)
    if (searchTerm) {
      searchQuery.$or = [
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    // Filter by status: 'blocked' or 'active'
    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    // 2. Count total matched users
    const totalUsers = await User.countDocuments(searchQuery);

    // 3. Fetch paginated user list sorted by latest signup
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 }) // Newest first
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullName email phone createdAt isBlocked _id');


    // 4. Pagination variables
    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    // 5. Render EJS view
    res.render('customer-listing', {
      users,
      currentPage: page,
      totalPages,
      totalUsers,
      startIdx,
      endIdx,
      searchTerm,
      statusFilter,
    });

  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).send('Server error');
  }
};


const getUsersApi = async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 8; // Changed to 10 users per page

    let searchQuery = {};
    if (searchTerm) {
      searchQuery.$or = [
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    const totalUsers = await User.countDocuments(searchQuery);
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 }) // Newest first
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullName email phone createdAt isBlocked _id');

    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    res.status(200).json({
      success: true,
      users,
      currentPage: page,
      totalPages,
      totalUsers,
      startIdx,
      endIdx,
    });
  } catch (error) {
    console.error('Error fetching users for API:', error.message);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("fullName email phone createdAt isBlocked");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const blockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndUpdate(
      userId,
      { isBlocked: true },
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
      message: "User blocked successfully",
      user: { id: user._id, isBlocked: user.isBlocked },
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const unblockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndUpdate(
      userId,
      { isBlocked: false },
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
      message: "User unblocked successfully",
      user: { id: user._id, isBlocked: user.isBlocked },
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = { getUsers, getUsersApi, getUserById, blockUser, unblockUser };