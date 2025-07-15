// Admin category management controller
const Category = require('../../models/category-schema');
const mongoose = require('mongoose');

const renderCategoryManagementPage = async (req, res) => {
    try {
        res.render('get-category', { 
        });
    } catch (error) {
        console.error("Error rendering category page:", error);
        res.status(500).send("Error loading the page.");
    }
};

const getAllCategoriesAPI = async (req, res) => {
    try {
        const categories = await Category.find({
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });
        
        const formattedCategories = categories.map(cat => ({
            _id: cat._id,
            name: cat.name,
            description: cat.description,
            categoryOffer: cat.categoryOffer || 0,
            isListed: cat.isListed,
            date: cat.createdAt.toISOString().split('T')[0]
        }));
        res.status(200).json(formattedCategories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
};

const addCategoryAPI = async (req, res) => {
    try {
        const { name, description, status, categoryOffer } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Category name is required.' });
        }

        if (categoryOffer !== undefined && (categoryOffer < 0 || categoryOffer > 100)) {
            return res.status(400).json({ message: 'Category offer must be between 0 and 100.' });
        }

        const newCategory = new Category({
            name,
            description,
            categoryOffer: categoryOffer || 0,
            status: status !== undefined ? status : true
        });

        await newCategory.save();
        res.status(201).json({
            _id: newCategory._id,
            name: newCategory.name,
            description: newCategory.description,
            categoryOffer: newCategory.categoryOffer,
            status: newCategory.status,
            date: newCategory.createdAt.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error adding category:", error);
        if (error.code === 11000 || error.message.includes('A category with this name already exists')) {
            return res.status(409).json({ message: 'A category with this name already exists.' });
        }
        res.status(500).json({ message: 'Error adding category', error: error.message });
    }
};

const updateCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status, categoryOffer } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }

        if (!name) {
            return res.status(400).json({ message: 'Category name is required.' });
        }

        if (categoryOffer !== undefined && (categoryOffer < 0 || categoryOffer > 100)) {
            return res.status(400).json({ message: 'Category offer must be between 0 and 100.' });
        }
        
        if (name) {
            const existingCategory = await Category.findOne({
                name: new RegExp(`^${name}$`, 'i'),
                _id: { $ne: id },
                $or: [
                    { isDeleted: false },
                    { isDeleted: { $exists: false } }
                ]
            });
            if (existingCategory) {
                return res.status(409).json({ message: 'Another category with this name already exists.' });
            }
        }

        const updateData = { name, description };
        if (status !== undefined) {
            updateData.status = status;
        }
        if (categoryOffer !== undefined) {
            updateData.categoryOffer = categoryOffer;
        }

        const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

        if (!updatedCategory) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        res.status(200).json({
            _id: updatedCategory._id,
            name: updatedCategory.name,
            description: updatedCategory.description,
            categoryOffer: updatedCategory.categoryOffer,
            status: updatedCategory.status,
            date: updatedCategory.createdAt.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error updating category:", error);
         if (error.code === 11000) {
            return res.status(409).json({ message: 'A category with this name already exists.' });
        }
        res.status(500).json({ message: 'Error updating category', error: error.message });
    }
};

const toggleCategoryStatusAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }
        if (typeof status !== 'boolean') {
            return res.status(400).json({ message: 'Invalid status value. Must be true or false.' });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        category.isListed = status;
        await category.save();

        res.status(200).json({
             message: `Category "${category.name}" status updated.`,
             category: {
                _id: category._id,
                status: category.status
             }
        });
    } catch (error) {
        console.error("Error toggling category status:", error);
        res.status(500).json({ message: 'Error toggling category status', error: error.message });
    }
};

const updateCategoryOfferAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { categoryOffer } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }

        if (categoryOffer === undefined || categoryOffer === null) {
            return res.status(400).json({ message: 'Category offer is required.' });
        }

        if (categoryOffer < 0 || categoryOffer > 100) {
            return res.status(400).json({ message: 'Category offer must be between 0 and 100.' });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        if (category.isDeleted) {
            return res.status(400).json({ message: 'Cannot update offer for deleted category.' });
        }

        category.categoryOffer = categoryOffer;
        await category.save();

        res.status(200).json({
            message: `Category "${category.name}" offer updated to ${categoryOffer}%.`,
            category: {
                _id: category._id,
                name: category.name,
                categoryOffer: category.categoryOffer
            }
        });
    } catch (error) {
        console.error("Error updating category offer:", error);
        res.status(500).json({ message: 'Error updating category offer', error: error.message });
    }
};

const deleteCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        if (category.isDeleted) {
            return res.status(400).json({ message: 'Category is already deleted.' });
        }

        category.isDeleted = true;
        category.isListed = false;
        await category.save();

        res.status(200).json({
            message: `Category "${category.name}" has been deleted successfully.`,
            category: {
                _id: category._id,
                name: category.name,
                isDeleted: category.isDeleted
            }
        });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: 'Error deleting category', error: error.message });
    }
};

module.exports = {
    renderCategoryManagementPage,
    getAllCategoriesAPI,
    addCategoryAPI,
    updateCategoryAPI,
    updateCategoryOfferAPI,
    toggleCategoryStatusAPI,
    deleteCategoryAPI
};