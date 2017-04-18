/**
 * Created by melontron on 4/13/17.
 */
var express = require('express');
var mongoose = require("mongoose");
var colors = require("./colorCodes");
var helpers = require("./components/helpers")
var app = express();
var bluebird = require("bluebird");
mongoose.connect('mongodb://ai.web-dorado.info/word-prediction');
mongoose.Promise = bluebird;

var options = {
    verbose: 5,
    refreshTokenAfter: 1000,
    graphApi: {
        appId: '756510614522578',
        appSecret: '04c7c217932871c39d83aa0d7055d688',
        version: "v2.8",
        redirectUri: ""
    }
};

var postController = require("./components/post/controller");
var scraperLogsController = require("./components/scraper-logs/controller");

var fbScraper = require("./fb-scraper")(options);
var args = helpers.parseArguments(process.argv);

var recurrentCycle = function (endpoint, iteratorType) {
    switch (iteratorType) {
        case "getPosts":
        {
            iterator.postIterator(endpoint);
            break;
        }
        case "getComments":
        {
            iterator.commentsIterator(endpoint);
            break;
        }
        default:
        {
            console.log("Exiting ...");
            break;
        }
    }
};


var Iterator = function (callback) {
    this.callback = callback;
    if ("function" !== typeof this.callback) {
        throw new Error("iterator callback should be a function");
    }

    this.postIterator = function (pageName, maxIter) {
        maxIter = ("number" == typeof maxIter) ? parseInt(maxIter) : 2;
        var pageId = null;
        var chain = helpers.chain();
        var nextUrl = null;
        var scraperLog = {};
        var posts = [];

        if (true == pageName) {
            /* if page name is not specified pick random one */
            chain = chain.then(function () {
                return new Promise(function (resolve, reject) {
                    scraperLogsController.getCount({}).then(function (count) {
                        var rand = parseInt(Math.floor(Math.random() * count)) - 1;
                            rand = (rand < 0) ? parseInt(-1*rand) : rand;
                        return postController.get({}, {limit: 1, skip: rand});
                    }).then(function (doc) {
                        pageName = doc[0].page_id;
                    }).then(resolve).catch(reject);
                })
            })
        }

        chain = chain.then(function () {
            return fbScraper.getPageId(pageName).catch(function (error) {
                console.log(colors.FgRed + "GRAPH API:" + error.error.message + colors.Reset);
                throw error;
            });
        }).then(function (_pageId) {
            pageId = _pageId;
            scraperLog.page_id = pageId;
            return scraperLogsController.get({page_id: pageId})
        }).then(function (scraperLog) {
            if (0 == scraperLog.length) {
                nextUrl = pageId
            } else {
                var doc = scraperLog[0];
                nextUrl = doc.next_url.replace("{ACCESS_TOKEN}", fbScraper.accessToken)
            }
            return nextUrl
        }).then(function (nextUrl) {
            return fbScraper.getPageFeedRecursive(nextUrl, maxIter);
        }).then(function (response) {
            var fragments = response.next_url.split("access_token=");
            var query = fragments[1].split("&");
            query[0] = "{ACCESS_TOKEN}";
            query = query.join("&");
            fragments[1] = query;
            scraperLog.next_url = fragments.join("access_token=");

            response.data.map(function (post) {
                posts.push({
                    post_id: post.id,
                    post: post.message || "",
                    page_id: pageId,
                    comments_added: false,
                    rand: Math.random(),
                    date_at: new Date()
                })
            });
            return postController.add(posts);
        }).then(function (result) {
            return scraperLogsController.update({page_id: scraperLog.page_id}, {next_url: scraperLog.next_url});
        });


        /**
         * Revert changes which are being caused by corrupted iteration
         * @returns {Promise}
         */
        function revertChanges() {
            return new Promise(function (resolve, reject) {
                postController.remove({
                    post_id: posts.map(function (post) {
                        return post.post_id;
                    })
                }).then(function (res) {
                    console.log(colors.FgCyan + "Posts created during corrupted " +
                        "iteration successfully removed" + colors.Reset);
                    return scraperLogsController.update({page_id: scraperLog.page_id}, {next_url: nextUrl});
                }).then(function (res) {
                    console.log(colors.FgCyan + "Scraper log reverted to the previous version" + colors.Reset);
                    return resolve();
                }).catch(reject)
            })
        }

        chain.then(function (data) {
            _this.callback(pageName, "getPosts");
        }).catch(function (err) {
            console.log(colors.FgRed, err);
            errors.getPosts++;
            console.log(colors.FgRed + "Reverting changes made buy corrupted iteration" + colors.Reset);
            if (errors.getPosts < errors.getPostsLimit) {
                _this.callback(pageName, "getPosts");
            } else {
                console.log(colors.FgRed + "Max Error limit exceeded" + colors.Reset);
            }
            return revertChanges();
        }).catch(function (err) {
            throw err;
        })
    };

    this.commentsIterator = function (pageName) {
        pageName = ("undefined" == typeof pageName) ? true : pageName;
        var chain = helpers.chain(null);
        if (true != pageName) {
            chain = chain.then(function () {
                return fbScraper.getPageId(pageName);
            }).catch(function (error) {
                console.log(colors.FgRed + error.error.message + colors.Reset);
                throw error;
            });
        }


        var query;
        chain.then(function (res) {
            query = {
                comments_added: false
            };
            var limit = 1;
            if (null !== res) {
                query.page_id = res;
            } else {
                query.rand = Math.random();
            }
            return postController.get(query, {limit: limit});
        }).then(function (posts) {
            if( true != pageName && posts.length == 0){
                console.log(colors.FgYellow + "MongoDb request with query: " + JSON.stringify(query) +
                    " does not match any posts" + colors.Reset);
                console.log(colors.FgYellow + "Terminating" + colors.Reset);
            }

            var postsChain = helpers.chain();
            posts.map(function (post) {
                postsChain = postsChain.then(function () {
                    return new Promise(function (resolve, reject) {
                        return fbScraper.getPostCommentsRecursive(post.post_id, 400).then(function (response) {
                            return fbScraper.enrichComments(response.data);
                        }).then(fbScraper.filterComments).then(function (dd) {
                            post.comments = dd.filter(function (comment) {
                                return comment != null;
                            });
                            post.comments_added = true;
                            return post.save()
                        }).then(resolve).catch(reject);
                    });
                })
            });
            return postsChain
        }).then(function () {
            _this.callback(pageName, "getComments");
        }).catch(function (err) {
            errors.getComments++;
            console.log(colors.FgYellow + "Warning: getComment promise failed to resolve in commentsIterator" + colors.Reset);
            if (errors.getComments < errors.getCommentsLimit) {
                _this.callback(pageName, "getComments");
            } else {
                console.log(colors.FgRed + "Max Error limit exceeded" + colors.Reset);
            }
        })

    };
    var _this = this;
    return this;
};

var iterator = new Iterator(recurrentCycle);

var scraper = function () {
    if (args.getPosts) {
        var pEndpoint;
        if( args.getPosts == 0 ){
            console.log(colors.FgGreen + "Starting to scrape facebook posts from random page" + colors.Reset);
            pEndpoint = true
        }else if( args.getPosts === true && args.page ){
            console.log(colors.FgGreen + "Starting to scrape facebook posts from page: "
                + colors.FgMagenta + args.page + colors.Reset);
            pEndpoint = args.page;
        }else{
            console.log(colors.FgGreen + "Starting to scrape facebook posts from page: " +
                colors.FgMagenta + args.getPosts + colors.Reset);
            pEndpoint = args.getPosts;
        }
        recurrentCycle(pEndpoint, "getPosts");
    }

    if (args.getComments) {
        var cEndpoint;
        if( args.getComments == 0 ){
            console.log(colors.FgGreen + "Starting to scrape facebook comments from random page post" + colors.Reset);
            cEndpoint = true
        }else if( args.getComments === true && args.page ){
            console.log(colors.FgGreen + "Starting to scrape facebook comments from posts of page: "
                + colors.FgMagenta + args.page + colors.Reset);
            cEndpoint = args.page;
        }else{
            console.log(colors.FgGreen + "Starting to scrape facebook comments from posts of page: " +
                colors.FgMagenta + args.getComments + colors.Reset);
            cEndpoint = args.getComments;
        }
        recurrentCycle(cEndpoint, "getComments")
    }

};
scraper();



// function fixPosts() {
//     postController.model.find({comments_added: true, comments: {$gt: []}}).then(function (data) {
//         data.map(function (data) {
//             var newComm = [];
//             data.comments.map(function (comment) {
//                 comment = comment.replace(/[\s\n\r\t]((https?\/)|(www.))\S+/g, "");
//                 comment = comment.replace(/\s+/g," ");
//                 comment = comment.trim();
//                 var words = comment.split(" ").filter(function (item) {
//                     return "" != item;
//                 });
//
//                 if( words.length >= 4 ){
//                     newComm.push(comment);
//                 }
//             });
//             data.comments = newComm;
//             data.save().then(function (data) {
//                 console.log(data.post_id);
//             }).catch(console.log)
//         })
//     }).catch(console.log)
// }
// fixPosts();

var errors = {
    getPosts: 0,
    getPostsLimit: 1000,
    getComments: 0,
    getCommentsLimit: 1000
};
