// Admin user management controller
const User = require("../../models/user-schema");

const getUsers = async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    let searchQuery = {};
    if (searchTerm) {
      searchQuery.$or = [
        { fullname: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }
    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    const totalUsers = await User.countDocuments(searchQuery);
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullname email phone createdAt isBlocked _id')
      .lean();

    const modifiedUsers = users.map(user => ({
      ...user,
      fullName: user.fullname && user.fullname.trim() !== '' ? user.fullname : user.email.split('@')[0],
      fullname: undefined
    }));

    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    res.render('customer-listing', {
      users: modifiedUsers,
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
    const limit = 10;

    let searchQuery = {};
    if (searchTerm) {
      searchQuery.$or = [
        { fullname: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }
    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    const totalUsers = await User.countDocuments(searchQuery);
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullname email phone createdAt isBlocked _id')
      .lean();

    const modifiedUsers = users.map(user => ({
      ...user,
      fullName: user.fullname && user.fullname.trim() !== '' ? user.fullname : user.email.split('@')[0],
      fullname: undefined
    }));

    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    res.status(200).json({
      success: true,
      users: modifiedUsers,
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
    const user = await User.findById(userId)
      .select('fullname email phone createdAt isBlocked')
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({
      ...user,
      fullName: user.fullname && user.fullname.trim() !== '' ? user.fullname : user.email.split('@')[0],
      fullname: undefined
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
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
        message: 'User not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      user: { id: user._id, isBlocked: user.isBlocked },
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
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
        message: 'User not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      user: { id: user._id, isBlocked: user.isBlocked },
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

module.exports = { getUsers, getUsersApi, getUserById, blockUser, unblockUser };