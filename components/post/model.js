/**
 * Created by melontron on 4/15/17.
 */
var mongoose = require('mongoose');

var model = mongoose.model("post",new mongoose.Schema({
    page_id : {type: String, required: true},
    post_id : { type: String, required: true, unique: true },
    post:{ type: String },
    comments:{type: Array},
    date_mod:{type: Date, default: Date.now},
    rand: {type: Number, default: Math.random},
    comments_added:{type: Boolean, default: false}
}, {collection: "posts"}));

module.exports = model;