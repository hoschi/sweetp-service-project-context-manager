var arango = require('arangojs');
var async = require('async');
var _ = require('lodash');
var nconf = require('nconf');
var sweetp = require('sweetp-base');
var leet = require('l33teral');
var log = require('sweetp-base/lib/log')('project-context-manager:internal:');

// setup configuration hierarchy: environment, args, defaults
nconf.env().argv();
nconf.defaults({
	dbConnection: 'http://localhost:8529/sweetp'
});
exports.nconf = nconf;
exports.contextsCollectionName = 'projectContexts';

// module variables
var ticketContextNamePrefixDefault;
ticketContextNamePrefixDefault = 'ticket/';

// private helpers
function mapWith (fn) {
	return function (list) {
		return _.map(list, fn);
	};
}

function callServices (serviceNames, url, project, context, callback) {
	var params, callServicesFor, serviceCalls;

	if (!serviceNames || serviceNames.length <= 0) {
		return callback(null);
	}

	params = {
		context: JSON.stringify(context)
	};

	// create service calls from map with service names
	callServicesFor = mapWith(function (service) {
		// call service specified with context, use next service call as callback
		return function (serviceHandlerResponses, next) {
			log.debug("{" + serviceNames + "}", "call service:", service, "params:", params);
			sweetp.callService(url, project, service, params, false, function (err, response) {
				serviceHandlerResponses.push(response);
				next(err, serviceHandlerResponses);
			});
		};
	});

	serviceCalls = [];

	// initialize servicer responses
	serviceCalls.push(function (next) {
		next(null, []);
	});

	// create service calls from map
	serviceCalls = serviceCalls.concat(callServicesFor(serviceNames));

	// call each service one after the other
	async.waterfall(serviceCalls, function (err, serviceHandlerResponses) {
		if (err) {
			// add successfull service responses also to list, this way the
			// user knows what service calls worked already
			err = new Error(JSON.stringify(serviceHandlerResponses) + "\n" + err);
		}

		return callback(err, serviceHandlerResponses);
	});
}

// module
exports._liftDbError = function (callback) {
	return function (err, response, opaque) {
		return callback(this._getErrorFromResponse(err, response), response, opaque);
	}.bind(this);
};

exports._getErrorFromResponse = function (err, response) {
	if (response && response.error) {
		return new Error([response.code, response.errorNum, response.errorMessage].join(' '));
	} else if (err) {
		return new Error('Response callback error: ' + err.toString());
	} else {
		return null;
	}
};

exports.getDb = function (callback) {
	var connection, db;

	if (this._db) {
		if (callback) {
			callback(undefined, undefined, this._db);
		}
		return this._db;
	}

	connection = nconf.get('dbConnection');
	db = arango.Connection(connection);

	// check one times if DB and collection exists

	async.waterfall([function (next) {
			db.database.current(next);
		}, function (response, opaque, next) {
			db.collection.list(true, next);
		}, function (response, opaque, next) {
			var found;

			found = response.collections.some(function (collection) {
				return collection && collection.name === this.contextsCollectionName;
			}.bind(this));

			if (found) {
				next(null, "All fine.");
			} else {
				db.collection.create(this.contextsCollectionName, function (err, response) {
					next(this._getErrorFromResponse(err, response), "Collection created.");
				}.bind(this));
			}
		}.bind(this)
	], function (err, response) {
			err = this._getErrorFromResponse(err, response);

			if (err) {
				log.error(err);
				if (callback) {
					return callback(err);
				}
			}

			if (callback) {
				return callback(undefined, response, db);
			}
		}.bind(this));

	this._db = db;
	return this._db;
};

exports.getContexts = function (projectName, name, isActive, callback) {
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

	this.getDb().query.for('context').in(this.contextsCollectionName)
		.filter(filter)
		.return('context')
		.exec(env, function (err, response) {
			callback(this._getErrorFromResponse(err, response), response.result);
		}.bind(this));
};

exports.deactivateContext = function (params, callback) {
	var projectName, paramsLeet, callServicesOnFinish;

	projectName = params.config.name;
	paramsLeet = leet(params);

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onDeactivate', null), params.url, projectName);

	async.waterfall([function (next) {
			this._currentContext(params, next);
		}.bind(this), function (context, next) {
			if (context) {
				// update
				context.isActive = false;
				this.getDb().document.patch(context._id, {
					isActive: context.isActive
				}, function (err) {
						next(err, context);
					});
			} else {
				next(null, null);
			}
		}.bind(this), function (context, next) {
			if (!context) {
				// no active context found
				return next(null, {
					msg: "No active context."
				});
			}

			callServicesOnFinish(context, function (err, serviceHandlerResponses) {
				return next(err, {
					msg: "Context deactivated.",
					context: context,
					serviceHandlerResponses: serviceHandlerResponses
				});
			});
		}.bind(this)
	], callback);

};

exports.activateContextForTicket = function (params, callback) {
	var ticketId, name, contextProperties;

	if (!params.ticketId) {
		return callback(new Error("Can't activate context for a ticket without a ticket id."));
	}

	ticketId = params.ticketId.toString();

	contextProperties = {
		ticketId: ticketId
	};

	// get prefix for context name
	if (!params.config.projectContextManager ||
		!params.config.projectContextManager.ticketContextNamePrefix) {
		name = ticketContextNamePrefixDefault;
	} else {
		name = params.config.projectContextManager.ticketContextNamePrefix;
	}

	// add ticket id to name
	name += ticketId;

	// modify params to match base method
	delete params.ticketId;
	params.name = name;

	// proceed as normal
	this.activateContextWithProperties(params, contextProperties, callback);
};

exports.activateContext = function (params, callback) {
	return this.activateContextWithProperties(params, undefined, callback);
};

exports.activateContextWithProperties = function (params, contextProperties, callback) {
	var projectName, name, callServicesOnFinish, paramsLeet;

	projectName = params.config.name;
	name = params.name;
	paramsLeet = leet(params);

	if (!name) {
		return callback(new Error("Can't activate context without a name for it."));
	}

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onActivate', null), params.url, projectName);

	async.waterfall([function (next) {
			this._currentContext(params, next);
		}.bind(this), function (context, next) {
			if (context && context.name !== name) {
				return next(new Error("Active context detected! You must deactivate it, before activating another context."));
			}

			// fetch context
			this.getContexts(projectName, name, undefined, function (err, result) {
				next(err, _.first(result));
			});
		}.bind(this), function (context, next) {
			if (context) {
				// update
				this.getDb().document.patch(context._id, {
					isActive: true
				}, function (err, response) {
						next(this._getErrorFromResponse(err, response), context);
					}.bind(this));
			} else {
				// create
				context = {
					projectName: projectName,
					name: name,
					isActive: true
				};

				// assign properties computed already
				_.assign(context, contextProperties);

				// save it
				this.getDb().document.create(this.contextsCollectionName, context, function (err, response) {
					// check for error
					if (err) {
						return callback(err);
					}
					// save id of new context in object we pass to other sevices,
					// so they can modify it
					context._id = response._id;
					next(this._getErrorFromResponse(err, response), context);
				}.bind(this));
			}
		}.bind(this), function (context, next) {
			callServicesOnFinish(context, function (err, serviceHandlerResponses) {
				next(err, {
					msg: 'success',
					serviceHandlerResponses: serviceHandlerResponses
				});
			});
		}.bind(this)
	], callback);

};

exports._currentContext = function (params, callback) {
	var projectName;

	projectName = params.config.name;

	this.getContexts(projectName, undefined, true, function (err, result) {
		var context;
		context = _.first(result);
		callback(err, context);
	});
};

exports.currentContext = function (params, callback) {
	this._currentContext(params, function (err, context) {
		// can't return 'undefined' to sweetp
		if (!context) {
			return callback(null, 'no active context');
		}
		callback(null, context);
	});
};

exports._patchContext = function (id, properties, callback) {
	this.getDb().document.patch(id, properties, this._liftDbError(callback));
};

exports.patchContext = function (params, callback) {
	if (!params.id) {
		return callback(new Error("No context id provided!"));
	}

	if (!params.properties) {
		return callback(new Error("No properties provided!"));
	}
	log.debug("patch context:", params.id, "props:", params.properties);
	params.properties = JSON.parse(params.properties);

	this._patchContext(params.id, params.properties, callback);
};

