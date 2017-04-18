/**
 * Created by melontron on 4/13/17.
 */
var FB = require('fb');
var colors = require("./colorCodes");

var FbScraper = function (config) {

    this.accessToken = null;
    this.options = {
        verbose: false /* Show console.logs */
    };
    this.apiFields = {
        comment: ["id", "message", "message_tags"],
    };
    this.patterns = {
        smileys: /(\-\.\-)|(:-?P+)|(:-?D+)|(;-?\))|(:-?\))|(<3)|(\^_\^)|(xD+)|(:-?\()|(:'\()|(o\.o)|(o_o)|(\(y\))|(\>:O)|(8-\))|(\(\^\^\^\))|(\:\|\])|(\>\:\()|(\:v)|(:\/)|(\:3)|(\:\*)|(\;\*)/gi
    };
    this.apiConfig = {};
    this.graphApiCalls = 0;
    this.refreshTokenAfter = 1000;
    /**
     * Initialize module
     */
    this.init = function (config) {
        this.setOptions(config);
        this.checkOptions();
        this.patterns.emoji = require('emoji-regex')();
        this.log(1, colors.FgGreen + "[Fb-Scraper] successfully initialized" + colors.Reset);
    };

    this.checkOptions = function () {
        if (this.apiConfig.appId && this.apiConfig.appSecret) {

        } else {
            throw new Error(colors.FgRed + "Options are missing or invalid")
        }
    };

    this.setOptions = function (options) {
        var keys = Object.keys(options);
        keys.map(function (option) {
            switch (option) {
                case "verbose":
                {
                    if (options.verbose >= 0 || options.verbose <= 5) {
                        _this.options.verbose = options.verbose;
                    } else {
                        throw new Error(colors.FgRed + "verbose option should be between 0 and 5");
                    }
                    break;
                }
                case "refreshTokenAfter":
                {
                    if (typeof options.refreshTokenAfter == "number" && options.refreshTokenAfter > 0) {
                        _this.refreshTokenAfter = options.refreshTokenAfter;
                    } else {
                        throw new Error(colors.FgRed + "refreshTokenAfter options should be a positive integer");
                    }
                    break;
                }
                case "graphApi":
                {
                    if (typeof options.graphApi.appId == "string" && typeof options.graphApi.appSecret == "string") {
                        _this.apiConfig.appId = options.graphApi.appId;
                        _this.apiConfig.appSecret = options.graphApi.appSecret;
                        _this.apiConfig.version = options.version || "v2.8";
                    } else {
                        throw new Error(colors.FgRed + "Invalid Graph API configs provided");
                    }
                    break;
                }
                default:
                {
                    break;
                }
            }
        })
    };
    /**
     * Make api call and get access token
     * @returns {Promise}
     */
    this.getAccessToken = function () {
        var endpoint = "oauth/access_token?client_id=" +
            _this.apiConfig.appId + "&client_secret=" +
            _this.apiConfig.appSecret + "&grant_type=client_credentials";
        return new Promise(function (resolve, reject) {
            FB.api(endpoint, function (res) {
                _this.log(1, colors.FgGreen + "GRAPH API{" + _this.graphApiCalls + "}:" + colors.Reset, endpoint);
                _this.graphApiCalls++;
                if (res.error || !res.access_token) return reject(res);
                resolve(res.access_token);
            });
        })
    };

    /**
     * save access token in appropirate class variable
     * @param token
     */
    this.setAccessToken = function (token) {
        _this.accessToken = token;
    };

    /**
     * authorize and update access token
     * @returns {Promise}
     */
    this.auth = function () {
        return new Promise(function (resolve, reject) {
            _this.getAccessToken().then(_this.setAccessToken).then(function () {
                FB.setAccessToken(_this.accessToken);
                resolve();
            }).catch(reject);
        });
    };

    /**
     * make facebook GRAPH API call
     * @param endpoint endpoint on wich to perform the call
     * @returns {Promise}
     */
    this.api = function (endpoint, logPriority) {
        if( typeof logPriority != "number") logPriority = 0;

        return new Promise(function (resolve, reject) {
            var chain = new _this.Chain();
            if (_this.graphApiCalls % _this.refreshTokenAfter == 0) {
                chain = chain.then(_this.auth);
            }
            chain.then(function () {
                FB.api(endpoint, function (res) {
                    _this.log(logPriority,colors.FgGreen + "GRAPH API{" + _this.graphApiCalls + "}:" + colors.Reset, endpoint);
                    _this.graphApiCalls++;
                    if (res.error) return reject(res);
                    resolve(res);
                })
            })
        })
    };

    /**
     * Get page ID from slug
     * @param pageName
     * @returns {Promise}
     */
    this.getPageId = function (pageName) {
        return new Promise(function (resolve, reject) {
            _this.api(pageName, 1).then(function (res) {
                resolve(res.id);
            }).catch(reject)
        })
    };

    /**
     * Get page feed by page id
     * @param pageId
     * @returns {Promise}
     */
    this.getPageFeed = function (pageId) {
        return new Promise(function (resolve, reject) {
            var httpRegex = /(http:\/\/)|(https:\/\/)/g;
            var endpoint;
            if (pageId.match(httpRegex) == null) {
                endpoint = (pageId + "/feed").replace(/\/+/g, "/")
            } else {
                endpoint = _this.getEndpointFromPaginationUrl(pageId);
            }
            _this.api(endpoint,2).then(resolve).catch(reject)
        })
    };

    /**
     * Get post comments by postId
     * @param postId
     * @returns {Promise}
     */
    this.getPostComments = function (postId) {
        return new Promise(function (resolve, reject) {
            var httpRegex = /(http:\/\/)|(https:\/\/)/g;
            var endpoint;
            var fields = Array.isArray(_this.apiFields.comments) ? "fields=" + _this.apiFields.comments.join(",") : "";
            if (postId.match(httpRegex) == null) {
                endpoint = (postId + "/comments?" + fields).replace(/\/+/g, "/")
            } else {
                endpoint = _this.getEndpointFromPaginationUrl(postId);
            }
            _this.api(endpoint,2).then(resolve).catch(reject)
        })
    };

    /**
     * Get single comment by comment id
     * @param commentId
     * @returns {Promise}
     */
    this.getComment = function (commentId) {
        return new Promise(function (resolve, reject) {
            var fields = Array.isArray(_this.apiFields.comment) ? "fields=" + _this.apiFields.comment.join(",") : "";
            var endpoint = commentId + "?" + fields;
            _this.api(endpoint,3).then(resolve).catch(reject);
        })
    };

    /**
     * Split pagination url and take part after version which is correct endpoint
     * @param url
     * @returns {*}
     */
    this.getEndpointFromPaginationUrl = function (url) {
        var endpoint = url.split(_this.apiConfig.version + "/")[1];
        if (typeof endpoint == "undefined") throw ({
            status: 400,
            message: "current the api version specified in config and current facebook GRAPH API version doesn't match"
        });
        return endpoint;
    };

    /**
     * Get all comments of specified post by postId
     * @param postId
     * @returns {Promise}
     */
    this.getPostCommentsRecursive = function (postId, maxIter) {
        if (typeof maxIter != "number") maxIter = -1
        var comments = [];
        return new Promise(function (resolve, reject) {
            var getComments = function (endpoint) {
                _this.recursiveIterator(endpoint, _this.getPostComments, comments, maxIter, function (err, data) {
                    if (err) return reject(err);
                    resolve(data)
                });
            };
            getComments(postId);
        });
    };

    /**
     * Recursively iterate through endpoint with endpointHandler function and colect data
     * @param endpoint endpoint from which to start iteration
     * @param endpointHandler function which will call endpoint
     * @param container here data from endpointHandler will be collected
     * @param maxIter OPTIONAL if specified recursion will breake after specifed iteration
     * @param callback
     */
    this.recursiveIterator = function (endpoint, endpointHandler, container, maxIter, callback) {
        var maxIterBrake = false;
        if ("function" == typeof maxIter) {
            callback = maxIter;
            maxIter = null;
        } else if (-1 == maxIter) {
            maxIter = null;
        }

        if ("string" != typeof endpoint)
            throw new Error("First argument of recursive iterator should be a string");
        if ("function" !== typeof endpointHandler)
            throw new Error("Second argument of recursiveIterator should be a function");
        if ("function" !== typeof callback)
            throw new Error("Last argument of recursiveIterator should be a function");
        if (!Array.isArray(container))
            throw new Error("Third argument of recursive iterator should be an array");

        endpointHandler(endpoint).then(function (response) {
            if (typeof maxIter == "number") {
                if (maxIter < 0) {
                    throw new Error("maxIter should be positive integer");
                }
                maxIterBrake = true;
                maxIter = parseInt(maxIter);
                _this.log(5,colors.FgCyan + "Remaining Iterations" + colors.Reset, maxIter);
                maxIter--;
            }

            if (Array.isArray(response.data)) {
                response.data.map(function (item) {
                    container.push(item);
                })
            } else {
                _this.log(5, colors.FgCyan + "items have been finished" + colors.Reset, container.length);
                return callback(null, {
                    data: container,
                    next_url: null
                });
            }

            if (typeof response.paging != "undefined" && typeof response.paging.next != "undefined") {
                if (maxIterBrake == true && maxIter == 0) {
                    callback(null, {
                        data: container,
                        next_url: response.paging.next
                    })
                } else {
                    _this.recursiveIterator(response.paging.next, endpointHandler, container, maxIter, callback);
                }
            } else {
                _this.log(5, colors.FgCyan + "pagination has finished" + colors.Reset);
                return callback(null, {
                    data: container,
                    next_url: null
                });
            }
        }).catch(function (err) {
            callback(err, null);
        })
    };

    /**
     * Get detailed info for each comment
     * @param comments
     * @returns {Promise}
     */
    this.enrichComments = function (comments) {
        return new Promise(function (resolve, reject) {
            var chain = new _this.Chain();
            var container = [];
            var j = 0;
            for( var i = 0; i < comments.length; i++ ){
                var words = comments[i].message.split(" ").filter(function (i) {
                    return i != "";
                });
                if( words.length <= 3 ){
                    comments.splice(i,1);
                    i--;
                }else{
                    var comment = comments[i];
                    (function (comment) {
                        j++;
                        chain = chain.then(function () {
                            return new Promise(function (resolve, reject) {
                                _this.getComment(comment.id).then(function (data) {
                                    container.push(data);
                                    resolve();
                                }).catch(reject)
                            });
                        })
                    })(comment)
                }
            }
            chain.then(function () {
                resolve(container);
            }).catch(reject)
        })
    };

    /**
     * Remove progile tags from array of comments and apply to them language filter
     * @param comments
     * @returns {Array}
     */
    this.filterComments = function (comments) {
        var i;
        var messages = [];
        for (i = 0; i < comments.length; i++) {
            if (typeof comments[i].message_tags != "undefined") {
                /* remove tags from message */
                comments[i].message_tags.map(function (tag) {
                    comments[i].message = comments[i].message.replace(tag.name, "");
                });
            }

            comments[i] = _this.applyLanguageFilters(comments[i]);
            if (null != comments[i]) {
                messages.push(comments[i].message)
            }
        }
        return messages;
    };

    /**
     * clear emojis,urls and hashtags from comments and keep comments which contain only ASCII characters
     * @param comment
     * @returns {*}
     */
    this.applyLanguageFilters = function (comment) {
        /* split all emojis and check if message contains characters other then english characters */
        var message = comment.message;
        message = message.replace(_this.patterns.emoji, "");

        /* check if comment contains any non english character( by english I mena ASCII ) */
        var test = message.match(/^[\x20-\x7E]+$/g);
        if (null == test) {
            /*message is not english*/
            return null;
        } else {
            /* split urls from message */
            message = message.replace(/[\s\n\r\t]((https?:\/\/)|(www.))\S+/g, "");
            /*remove hashtags*/
            message = message.replace(/#\S+/, "")

            /* add missing fullstop */
            if (message[message.length - 1] != ".") message += ".";

            /* sentences should start with words*/
            message = message.replace(/^[\.\,\?\!]+/g, "");

            message = message.replace(/\s+/g," ");

            /*trim message*/
            message = message.trim();

            var words = message.split(" ").filter(function (item) {
                return "" != item;
            });

            /* remove smileys */
            message = message.replace(_this.patterns.smileys, "");


            if( words.length >= 4 ){
                comment.message = message;
            }else{
                comment.message = null;
            }

        }


        return comment;
    };

    /**
     * Get page posts recursively
     * @param pageId
     * @param maxIter
     * @returns {Promise}
     */
    this.getPageFeedRecursive = function (pageId, maxIter) {
        if (typeof maxIter != "number") maxIter = -1;
        var posts = [];
        return new Promise(function (resolve, reject) {
            var getPosts = function (endpoint) {
                _this.recursiveIterator(endpoint, _this.getPageFeed, posts, maxIter, function (err, data) {
                    if (err) return reject(err);
                    resolve(data)
                });
            };
            getPosts(pageId);
        });
    };

    /**
     * If logging is enables then log
     */
    this.log = function () {
        var priority = 0, start = 0;
        if (typeof arguments[0] == "number") {
            priority = arguments[0];
            start = 1;
        }

        var print = "";

        for (var i = start; i < arguments.length; i++) {
            print += arguments[i].toString() + " "
        }


        if (_this.options.verbose >= priority)
            console.log(print);

    };

    this.Chain = function () {
        return new Promise(function (resolve, reject) {
            resolve();
        })
    };

    var _this = this;
    this.init(config);
    return this;
};


module.exports = FbScraper;