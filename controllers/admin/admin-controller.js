const loadAdminLogin = async (req,res) => {
  try {
    
    return res.render("admin-login");

  } catch (error) {
    
    console.log("Admin login page not loading");
    res.status(500).send("Server error")

  }
}


module.exports = {
  loadAdminLogin
}