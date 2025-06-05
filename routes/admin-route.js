const express = require("express");
const adminRoute = express.Router();

const adminController = require("../controllers/admin/admin-auth-controller");
const getUsersController = require("../controllers/admin/get-usersController");
const getCategoryController = require("../controllers/admin/get-categoryController");
const productController = require("../controllers/admin/product-controller");
const { productUpload, handleMulterError } = require("../config/multer-config");


//Admin Login
adminRoute.get("/admin-login",adminController.getAdminLogin);
adminRoute.post("/admin-login",adminController.postAdminLogin);


//Admin Dashboard
adminRoute.get("/admin-dashboard", adminController.getAdminDashboard);
adminRoute.get("/admin-logout", adminController.logoutAdminDashboard);


//User Management
adminRoute.get("/get-user", getUsersController.getUsers);
adminRoute.get("/get-users", getUsersController.getUsersApi);
adminRoute.get("/get-users/:id", getUsersController.getUserById);
adminRoute.put("/get-users/:id/block", getUsersController.blockUser);
adminRoute.put("/get-users/:id/unblock", getUsersController.unblockUser);


// Category Management
adminRoute.get('/get-category', getCategoryController.renderCategoryManagementPage);
adminRoute.get('/get-categories', getCategoryController.getAllCategoriesAPI);
adminRoute.post('/get-categories', getCategoryController.addCategoryAPI);
adminRoute.put('/get-categories/:id', getCategoryController.updateCategoryAPI);
adminRoute.patch('/get-categories/:id/status', getCategoryController.toggleCategoryStatusAPI);

// Product Management Routes
adminRoute.get('/get-product', productController.getProducts);
adminRoute.get('/add-product', productController.getAddProduct);
adminRoute.get('/edit-product/:id', productController.getEditProduct);

// Product API Routes
adminRoute.post('/api/products', productUpload.array('productImages', 10), handleMulterError, productController.addProduct);
adminRoute.get('/api/products/:id', productController.getProductById);
adminRoute.put('/api/products/:id', productUpload.array('productImages', 10), handleMulterError, productController.updateProduct);
adminRoute.delete('/api/products/:id', productController.deleteProduct);
adminRoute.patch('/api/products/:id/status', productController.toggleProductStatus);

// API for user dashboard
adminRoute.get('/api/products-for-user', productController.getProductsForUser);




module.exports = adminRoute;