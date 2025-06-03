const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const User = require('../../models/user-schema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');


const loadGetProducts = async (req, res) => {
  try {
    return res.render("get-product");
  } catch (error) {
    console.log("Error in loading Product page", error);
    res.status(500).send("Server error");
  }
};



const loadNewProduct = async (req, res) => {
  try {

    const categories = await Category.find({ isListed: true });
    return res.render("add-new-product", { cat: categories });
    
  } catch (error) { 
    console.log("Error in loading New Product page", error);
    res.status(500).send("Server error");
    
  }
};




module.exports = {

  loadGetProducts,
  loadNewProduct,
  
};