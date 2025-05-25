const express = require("express");
const app = express();
const path = require("path");
const mongoose = require ("mongoose");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");
const env = require("dotenv").config();
const port = process.env.PORT || 3001;
const authRoute = require("./routes/auth-route")
const adminRoute = require("./routes/admin-route")
const db = require("./config/db");
db();

const session = require('express-session');

app.use(session({
  secret: 'your_secret_key', 
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());
  
app.use(cookieParser());
app.use(express.json())
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));




app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"views/user"),path.join(__dirname,"views/admin")])


app.use("/",authRoute)
app.use("/admin",adminRoute)

// app.get("/",(req,res) => {
//   res.render("new-password")
// })



app.listen(port,() => {
    console.log("server is running http://localhost:3001")
})




