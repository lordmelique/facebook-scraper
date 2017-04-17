/**
 * Created by melontron on 4/15/17.
 */

var model = require("./model");
var joi = require("joi");
var helpers = require("../helpers");
var colors = require("../../colorCodes");
var controllerArgs = require("../controllerArgs.js").scraperLogs;
var Controller = function (args) {
    this.model = model;
    this.args = args;
    this.schema = {
        add: {
            page_id: joi.string().required().label("Page Id"),
            next_url: joi.string().required().label("Next Url")
        },
        get: {
            page_id: joi.string().label("Page Id"),
            rand: joi.number().label("Rand")
        },
        count:{
            page_id: joi.string().label("Page Id"),
            rand: joi.number().label("Rand")
        },
        update:{
            next_url: joi.string().required().label("Next Url"),
        }
    };

    this.add = function (items) {
        return new Promise(function (resolve, reject) {
            var chain = helpers.chain();
            var bulk = false;
            if (Array.isArray(items)) {
                bulk = true;
                items.map(function (item) {
                    chain = chain.then(function () {
                        return new Promise(function (res, rej) {
                            helpers.validateParams(item, _this.schema.add, {allowUnknown: false, abortEarly: true})
                                .then(res).catch(rej)
                        })
                    })
                })
            } else {
                chain = chain.then(function () {
                    return new Promise(function (res, rej) {
                        helpers.validateParams(items, _this.schema.add, {allowUnknown: false, abortEarly: true})
                            .then(res).catch(rej)
                    })
                })
            }

            chain.then(function (validated) {
                if (bulk) {
                    _this.model.collection.insert(items, {ordered: false}, function (err, res) {
                        if (err) {
                            if (11000 == err.code) {
                                    _this.log(colors.FgYellow + "Warning: Duplicate entry skipping" + colors.Reset);
                            } else {
                                return reject(err);
                            }
                        }
                        resolve(res);
                    })
                } else {
                    _this.model(items).save().then(resolve).catch(reject);
                }
            }).catch(reject)
        });
    };

    this.update = function (query, fields) {
        return new Promise(function (resolve, reject) {
            var chain = helpers.chain();
            chain = chain.then(function () {
                return new Promise(function (resolve, reject) {
                    helpers.validateParams(query, _this.schema.get, {allowUnknown: false, abortEarly: true})
                        .then(resolve).catch(reject);
                });
            });

            chain = chain.then(function () {
                return new Promise(function (resolve, reject) {
                    helpers.validateParams(fields, _this.schema.update, {allowUnknown: false, abortEarly: true})
                        .then(resolve).catch(reject);
                });
            });

            chain.then(function (val) {
                return _this.model.find(query);
            }).then(function (document) {
                var keys;
                if(document.length == 0){
                    var docModel = new _this.model;
                    keys = Object.keys(fields).concat(Object.keys(query));
                    keys.map(function (key) {
                        docModel[key] = fields[key] || query[key];
                    });
                    return docModel.save()
                }else{
                    document = document[0];
                    keys = Object.keys(fields);
                    keys.map(function (key) {
                        document[key] = fields[key];
                    });
                    return document.save();
                }
            }).then(resolve).catch(reject)
        });
    };

    this.get = function (query, options) {
        if( typeof options == "undefined") options = {};
        return new Promise(function (resolve, reject) {
            var chain = helpers.chain();
            chain = chain.then(function () {
                return new Promise(function (resolve, reject) {
                    helpers.validateParams(query, _this.schema.get, {allowUnknown: false, abortEarly: true})
                        .then(resolve).catch(reject);
                });
            });

            var opt = Object.keys(options);

            chain.then(function (val) {
                if (val.rand) {
                    val.rand = {$gt: val.rand};
                }
                var q = _this.model.find(val);
                opt.map(function (key) {
                    q = q[key](options[key]);
                });
                return q;
            }).then(resolve).catch(reject)
        });
    };

    this.getCount = function (query) {
        return new Promise(function (resolve, reject) {
            var chain = helpers.chain();
            chain = chain.then(function () {
                return new Promise(function (resolve, reject) {
                    helpers.validateParams(query, _this.schema.count, {allowUnknown: false, abortEarly: true})
                        .then(resolve).catch(reject);
                });
            });
            chain.then(function (val) {
                if (val.rand) {
                    val.rand = {$gt: val.rand};
                }

                return _this.model.count(val);
            }).then(resolve).catch(reject)
        });
    };

    /**
     * If logging is enables then log
     */
    this.log = function () {
        if (_this.args.verbose)
            console.log.apply(this, arguments);
    };

    var _this = this;
};

module.exports = new Controller(controllerArgs);

