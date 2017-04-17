/**
 * Created by melontron on 4/15/17.
 */
var Joi = require("joi");
var colors = require("../colorCodes");

module.exports.validateParams = function (params, schema, options) {
    options = options || {};
    var abortEarly = options.abortEarly || false;
    var allowUnknown = options.allowUnknown || false;
    return new Promise(function (resolve, reject) {
        Joi.validate(params, schema, {
                abortEarly: abortEarly,
                allowUnknown: allowUnknown,
                language: {
                    key: '{{!key}} '
                }
            },
            function (joiErr, value) {
                if (joiErr) {
                    var details = [];
                    joiErr.details.forEach(function (error) {
                        details.push({message: error.message, path: error.path});
                    });
                    reject({
                        status: 400,
                        message: "Validation error",
                        details: details,
                        development: {
                            error_info: joiErr.toString(),
                            error: joiErr
                        }
                    })
                } else {
                    resolve(value);
                }
            })
    });
};

module.exports.chain = function (resp) {
    return new Promise(function(resolve, reject){
        resolve(resp);
    })
};

module.exports.parseArguments = function (args) {
    var parsed = {};
    for( var i = 0; i < args.length; i++ ){
        switch(args[i]){
            case "-page":{
                if( typeof args[i+1] == "undefined" || args[i+1][0] == "-"){
                    throw new Error(colors.FgRed + "Page Id is required after option -page" + colors.Reset);
                }else{
                    parsed.page = args[i+1];
                }
                break;
            }
            case "-getComments":{
                if( typeof args[i+1] == "undefined" || args[i+1][0] == "-"){
                    parsed.getComments = true
                }else{
                    parsed.getComments = args[i+1];
                }
                break;
            }
            case "-getPosts":{
                if( typeof args[i+1] == "undefined" || args[i+1][0] == "-"){
                    parsed.getPosts = true
                }else{
                    parsed.getPosts = args[i+1];
                }
                break;
            }
        }
    }
    return parsed
}
