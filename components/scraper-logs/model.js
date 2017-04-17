/**
 * Created by melontron on 4/15/17.
 */
var mongoose = require('mongoose');

var model = mongoose.model("scraper-logs",new mongoose.Schema({
    page_id : {type: String, required: true, unique: true},
    date_mod:{type: Date, default: Date.now},
    next_url:{type: String},
    rand: {type: Number, default: Math.random()}
}, {collection: "scraper-logs"}));

module.exports = model;