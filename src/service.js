var async = require('async');
var _ = require('lodash');
var nconf = require('nconf');
var sweetp = require('sweetp-base');
var leet = require('l33teral');
var log = require('./log');
var dbHelper = require('./dbHelper');
var dbAbstraction = require('./dbAbstraction');

// setup configuration hierarchy: environment, args, defaults
nconf.env().argv();
nconf.defaults({
	dbConnection: 'http://localhost:8529/sweetp'
});

// module variables
var ticketContextNamePrefixDefault, db, initDb;

ticketContextNamePrefixDefault = 'ticket/';

// private helpers
initDb = function (callback) {
	return dbHelper.initDb(nconf.get('dbConnection'), callback);
};
db = initDb();

function mapWith (fn) {
	return function (list) {
		return _.map(list, fn);
	};
}

function callServices (serviceNames, url, project, context, callback) {
	var params, callServicesFor, serviceCalls, finalCallback;

	if (!serviceNames || serviceNames.length <= 0) {
		return callback(null);
	}

	params = {
		context: JSON.stringify(context)
	};

	// create service calls from map with service names
	callServicesFor = mapWith(function (service) {
		// call service specified with context, use next service call as callback
		return function (serviceHandlerResponses, lastContext, next) {
			if (lastContext) {
				params.context = JSON.stringify(lastContext);
			}
			log.debug("{" + serviceNames + "}", "call service:", service, "params:", params);
			sweetp.callService(url, project, service, params, false, function (err, response) {
				var currentContext;
				if (err) {
					return next(err, serviceHandlerResponses, lastContext);
				}

				// successfull call, refresh props
				serviceHandlerResponses.push(response.msg);
				currentContext = response.context;

				// call next service in list
				next(err, serviceHandlerResponses, currentContext);
			});
		};
	});

	serviceCalls = [];

	// initialize service responses
	serviceCalls.push(function (next) {
		next(undefined, [], undefined);
	});

	// create service calls from map
	serviceCalls = serviceCalls.concat(callServicesFor(serviceNames));

	finalCallback = function (err, serviceHandlerResponses) {
		if (err) {
			log.error("Some service call didn't succeed:", err);
			// add successfull service responses also to list, this way the
			// user knows what service calls worked already
			err = new Error(JSON.stringify(serviceHandlerResponses) + "\n" + err);
		}

		return callback(err, serviceHandlerResponses);
	};

	// call each service one after the other
	async.waterfall(serviceCalls, function (err, serviceHandlerResponses, contextFromServiceCalls) {
		if (contextFromServiceCalls) {
			log.error('There is a context from some succeeded service calls, try to save it.');
			db.document.put(contextFromServiceCalls._id, contextFromServiceCalls, dbHelper.liftDbError(function (putError) {
				if (putError) {
					if (!err) {
						err = "All services ran without errors.";
					}
					err += "\nAdditionally there was an error when saving context from service calls!\n:" + putError.toString();
					finalCallback(err, serviceHandlerResponses);
				} else {
					finalCallback(err, serviceHandlerResponses);
				}


			}));
		} else {
			finalCallback(err, serviceHandlerResponses);
		}
	});
}

// module
exports.deactivateContext = function (params, callback) {
	var projectName, paramsLeet, callServicesOnFinish;

	projectName = params.config.name;
	paramsLeet = leet(params);

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onDeactivate', null), params.url, projectName);

	async.waterfall([function (next) {
			dbAbstraction.currentContext(db, projectName, next);
		}.bind(this), function (context, next) {
			if (context) {
				// update
				context.isActive = false;
				db.document.patch(context._id, {
					isActive: context.isActive
				}, dbHelper.liftDbError(function (err) {
						next(err, context);
					}));
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
			dbAbstraction.currentContext(db, projectName, next);
		}.bind(this), function (context, next) {
			if (context && context.name !== name) {
				return next(new Error("Active context detected! You must deactivate it, before activating another context."));
			}

			// fetch context
			dbAbstraction.getContexts(db, projectName, name, undefined, true, function (err, result) {
				next(err, _.first(result));
			});
		}.bind(this), function (context, next) {
			var updatedProperties;
			updatedProperties = {
				isActive: true,
				isOpen: true
			};
			if (context) {
				// update
				_.assign(context, updatedProperties);
				db.document.patch(context._id, updatedProperties, dbHelper.liftDbError(function (err) {
					next(err, context);
				}.bind(this)));
			} else {
				// create
				context = {
					projectName: projectName,
					name: name
				};
				_.assign(context, updatedProperties);

				// assign properties computed already
				_.assign(context, contextProperties);

				// save it
				db.document.create(dbHelper.contextsCollectionName, context, function (err, response) {
					// check for error
					if (err) {
						return callback(dbHelper.getErrorFromResponse(err, response));
					}
					// save id of new context in object we pass to other sevices,
					// so they can modify it
					context._id = response._id;
					next(dbHelper.getErrorFromResponse(err, response), context);
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

exports.currentContext = function (params, callback) {
	dbAbstraction.currentContext(db, params.config.name, function (err, context) {
		// can't return 'undefined' to sweetp
		if (!context) {
			return callback(null, 'no active context');
		}
		callback(null, context);
	});
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

	db.document.patch(params.id, params.properties, dbHelper.liftDbError(callback));
};

exports._openCloseContext = function (projectName, contextName, shouldBeOpen, noContextFoundMsg, callServicesOnFinish, callback) {
	async.waterfall([function (next) {
			dbAbstraction.getContexts(db, projectName, contextName, undefined, !shouldBeOpen, function (err, result) {
				next(err, _.first(result));
			});
		}.bind(this), function (context, next) {
			if (context) {
				// update
				context.isOpen = shouldBeOpen;
				db.document.patch(context._id, {
					isOpen: context.isOpen
				}, dbHelper.liftDbError(function (err) {
						next(err, context);
					}));
			} else {
				next(null, null);
			}
		}.bind(this), function (context, next) {
			if (!context) {
				// no open/closed context found
				return next(null, {
					msg: noContextFoundMsg
				});
			}

			callServicesOnFinish(context, function (err, serviceHandlerResponses) {
				return next(err, {
					msg: "success",
					context: context,
					serviceHandlerResponses: serviceHandlerResponses
				});
			});
		}.bind(this)
	], callback);

};

exports.openContext = function (params, callback) {
	var projectName, paramsLeet, callServicesOnFinish, name;

	projectName = params.config.name;
	paramsLeet = leet(params);
	name = params.name;

	if (!name) {
		return callback(new Error("Can't open context without a name for it."));
	}

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onOpen', null), params.url, projectName);

	return this._openCloseContext(projectName, name, true, "No closed context to open.", callServicesOnFinish, callback);
};

exports.closeContext = function (params, callback) {
	var projectName, paramsLeet, callServicesOnFinish, name;

	projectName = params.config.name;
	paramsLeet = leet(params);
	name = params.name;

	if (!name) {
		return callback(new Error("Can't close context without a name for it."));
	}

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onClose', null), params.url, projectName);

	return this._openCloseContext(projectName, name, false, "No open context to close.", callServicesOnFinish, callback);
};
