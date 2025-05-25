const mongoose = require ("mongoose");
const { schema } = mongoose;

const catagorySchema = new mongoose.Schema ({
    name : {
        type : String,
        required : true,
        unique : true
    },
    description : {
        type : String,
        required :true
    },
    isListed : {
        type : Boolean,
        default : true
    },
    catagoryOffer : {
        type : Number,
        default : 0
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})


const Category = mongoose.model("Catagory",catagorySchema);

module.exports = Category;
