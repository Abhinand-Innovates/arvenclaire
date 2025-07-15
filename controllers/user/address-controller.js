// User address management controller
const Address = require('../../models/address-schema');
const User = require('../../models/user-schema');
const { 
    validateAddAddressForm, 
    validateUpdateAddressForm 
} = require('../../validator/addressValidator-simple');

const loadAddressList = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    const addressDoc = await Address.findOne({ userId }).populate('userId');
    const addresses = addressDoc ? addressDoc.address : [];

    res.render('address-list', {
      user,
      addresses,
      title: 'Address Book'
    });
  } catch (error) {
    console.error('Error loading address list:', error);
    res.status(500).render('error', { message: 'Error loading addresses' });
  }
};

const loadAddressForm = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;
    const returnTo = req.query.returnTo;

    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    let address = null;
    let isEdit = false;

    if (addressId) {
      const addressDoc = await Address.findOne({ userId });
      if (addressDoc) {
        address = addressDoc.address.id(addressId);
        isEdit = true;
      }
    }

    res.render('address', {
      user,
      address,
      isEdit,
      returnTo,
      title: isEdit ? 'Edit Address' : 'Add New Address'
    });
  } catch (error) {
    console.error('Error loading address form:', error);
    res.status(500).render('error', { message: 'Error loading address form' });
  }
};

const saveAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const validation = validateAddAddressForm(req.body);
    
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      return res.status(400).json({
        success: false,
        message: firstError
      });
    }

    let addressDoc = await Address.findOne({ userId });

    if (validation.validatedData.isDefault) {
      if (addressDoc) {
        addressDoc.address.forEach(addr => {
          addr.isDefault = false;
        });
      }
    }

    const newAddress = validation.validatedData;

    if (!addressDoc || addressDoc.address.length === 0) {
      newAddress.isDefault = true;
    }

    if (addressDoc) {
      addressDoc.address.push(newAddress);
    } else {
      addressDoc = new Address({
        userId,
        address: [newAddress]
      });
    }

    await addressDoc.save();

    const returnTo = req.query.returnTo;
    if (returnTo === 'checkout') {
      req.session.addressSuccess = 'Address added successfully';
      return res.redirect('/checkout');
    }

    res.json({
      success: true,
      message: 'Address saved successfully'
    });

  } catch (error) {
    console.error('Error saving address:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving address: ' + error.message
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;
    const validation = validateUpdateAddressForm(req.body);
    
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      return res.status(400).json({
        success: false,
        message: firstError
      });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const address = addressDoc.address.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (validation.validatedData.isDefault) {
      addressDoc.address.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    Object.assign(address, validation.validatedData);
    await addressDoc.save();

    const returnTo = req.query.returnTo;
    if (returnTo === 'checkout') {
      req.session.addressSuccess = 'Address updated successfully';
      return res.redirect('/checkout');
    }

    res.json({
      success: true,
      message: 'Address updated successfully'
    });

  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating address'
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const addressToDelete = addressDoc.address.id(addressId);
    if (!addressToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const wasDefault = addressToDelete.isDefault;
    addressDoc.address.pull(addressId);

    if (wasDefault && addressDoc.address.length > 0) {
      addressDoc.address[0].isDefault = true;
    }

    await addressDoc.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting address'
    });
  }
};

const setAsDefault = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const address = addressDoc.address.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    addressDoc.address.forEach(addr => {
      addr.isDefault = false;
    });

    address.isDefault = true;
    await addressDoc.save();

    res.json({
      success: true,
      message: 'Address set as default successfully'
    });

  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting default address'
    });
  }
};

module.exports = {
  loadAddressList,
  loadAddressForm,
  saveAddress,
  updateAddress,
  deleteAddress,
  setAsDefault
};