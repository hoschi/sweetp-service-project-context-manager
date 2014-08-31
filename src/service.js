var arango = require('arangojs');
var async = require('async');
var _ = require('lodash');
var nconf = require('nconf');

// setup configuration hierarchy: environment, args, defaults
nconf.env().argv();
nconf.defaults({
    dbConnection: 'http://localhost:8529/sweetp'
});
exports.nconf = nconf;

// module variables
var contextsCollectionName;
contextsCollectionName = 'projectContexts';

exports._getErrorFromResponse = function(err, response) {
    if (response && response.error) {
        return new Error([response.code, response.errorNum, response.errorMessage].join(' '));
    } else if (err) {
        return new Error('Response callback error: ' + err.toString());
    } else {
        return null;
    }
};

exports.getDb = function(callback) {
    var connection, db;

    if (exports._db) {
        return exports._db;
    }

    connection = nconf.get('dbConnection');
    db = arango.Connection(connection);

    // check one times if DB and collection exists

    async.waterfall([

        function(next) {
            db.database.current(next);
        },
        function(response, opaque, next) {
            db.collection.list(true, next);
        },
        function(response, opaque, next) {
            var found;

            found = response.collections.some(function(collection) {
                return collection && collection.name === contextsCollectionName;
            });

            if (found) {
                next(null, "All fine.");
            } else {
                db.collection.create(contextsCollectionName, function(err, response) {
                    next(exports._getErrorFromResponse(err, response), "Collection created.");
                });
            }
        }
    ], function(err, response) {
        err = exports._getErrorFromResponse(err, response);

        if (err) {
            console.error(err);
            if (callback) {
                return callback(err);
            }
        }

        if (callback) {
            return callback(null, response);
        }
    });

    exports._db = db;
    return exports._db;
};

exports.getContexts = function(projectName, name, isActive, callback) {
    var filter, env;

    filter = "context.projectName == @projectName";
    env = {
        projectName: projectName,
        name: name
    };

    if (name !== undefined) {
        filter += " && context.name == @name";
        env.name = name;
    }

    if (isActive !== undefined) {
        filter += " && context.isActive == @isActive";
        env.isActive = isActive;
    }

    exports.getDb().query.for('context').in(contextsCollectionName)
        .filter(filter)
        .return('context')
        .exec(env, function(err, response) {
            callback(exports._getErrorFromResponse(err, response), response.result);
        });
};

exports.deactivateContext = function(err, params, serviceMethodCallback) {
    var projectName;

    if (err) {
        return serviceMethodCallback(err);
    }

    projectName = params.config.name;

    async.waterfall([

        function(callback) {
            exports._currentContext(null, params, callback);
        },
        function(context, callback) {
            if (context) {
                // update
                context.isActive = false;
                exports.getDb().document.patch(context._id, {
                    isActive: context.isActive
                }, function(err) {
                    callback(err, {
                        msg: "Context deactivated.",
                        context: context
                    });
                });
            } else {
                // no active context found
                callback(null, {
                    msg: "No active context."
                });
            }
        }
    ], serviceMethodCallback);

};

exports.activateContext = function(err, params, callback) {
    var projectName, name;

    if (err) {
        return callback(err);
    }

    projectName = params.config.name;
    name = params.name;

    if (!name) {
        return callback(new Error("Can't activate context without a name for it."));
    }

    async.waterfall([

        function(next) {
            exports._currentContext(null, params, next);
        },
        function(context, next) {
            if (context && context.name !== name) {
                return next(new Error("Active context detected! You must deactivate it, before activating another context."));
            }

            // fetch context
            exports.getContexts(projectName, name, undefined, function(err, result) {
                next(err, _.first(result));
            });
        },
        function(context, next) {
            if (context) {
                // update
                exports.getDb().document.patch(context._id, {
                    isActive: true
                }, function(err) {
                    next(err, 'success');
                });
            } else {
                // create
                exports.getDb().document.create(contextsCollectionName, {
                    projectName: projectName,
                    name: name,
                    isActive: true
                }, function(err) {
                    next(err, 'success');
                });
            }
        }
    ], callback);

};

exports._currentContext = function(err, params, callback) {
    var projectName;

    if (err) {
        return callback(err);
    }

    projectName = params.config.name;

    exports.getContexts(projectName, undefined, true, function(err, result) {
        var context;
        context = _.first(result);
        callback(err, context);
    });
};

exports.currentContext = function(err, params, callback) {
    exports._currentContext(err, params, function(err, context) {
        if (err) {
            return callback(err);
        }

        // can't return 'undefined' to sweetp
        if (!context) {
            return callback(null, 'no active context');
        }
        callback(null, context);
    });
};
