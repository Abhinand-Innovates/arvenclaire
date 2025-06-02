const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const path = require("path");
const mongoose = require ("mongoose");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");
const env = require("dotenv").config();
const port = process.env.PORT || 3001;
const userRoute = require("./routes/user-route")
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

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.json())
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"views/user"),path.join(__dirname,"views/admin")])


app.use("/",userRoute);
app.use("/",adminRoute);

// app.get("/",(req,res) => {
//   res.render("add-new-product")
// })



app.listen(port,() => {
    console.log("server is running http://localhost:3001")
})




