var async = require('async');
var _ = require('lodash');
var nconf = require('nconf');
var leet = require('l33teral');
var log = require('./log');
var dbHelper = require('./dbHelper');
var dbAbstraction = require('./dbAbstraction');
var callServices = require('./callServices');
var paramAssertions = require('./paramAssertions');

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

exports.deactivateContext = function (params, callback) {
	var projectName, paramsLeet, callServicesOnFinish;

	projectName = params.config.name;
	paramsLeet = leet(params);

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onDeactivate', null), db, params.url, projectName);

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

exports.activateContext = paramAssertions.needsContextNameInParams('activate', function activateContext (params, callback) {
	return this.activateContextWithProperties(params, undefined, callback);
});

exports.activateContextWithProperties = function (params, contextProperties, callback) {
	var projectName, name, callServicesOnFinish, paramsLeet;

	projectName = params.config.name;
	name = params.name;
	paramsLeet = leet(params);

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.onActivate', null), db, params.url, projectName);

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

exports.patchContext = paramAssertions.patchContextAssertions(function patchContext (params, callback) {
	log.debug("patch context:", params.id, "props:", params.properties);
	params.properties = JSON.parse(params.properties);

	db.document.patch(params.id, params.properties, dbHelper.liftDbError(callback));
});

exports._openCloseContext = function (params, shouldBeOpen, eventHandlerPropertyName, noContextFoundMsg, callback) {
	var projectName, paramsLeet, callServicesOnFinish, contextName;

	projectName = params.config.name;
	paramsLeet = leet(params);
	contextName = params.name;

	callServicesOnFinish = _.partial(callServices, paramsLeet.tap('config.projectContextManager.' + eventHandlerPropertyName, null), db, params.url, projectName);

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

exports.openContext = paramAssertions.needsContextNameInParams('open', function openContext (params, callback) {
	return this._openCloseContext(params, true, 'onOpen', "No closed context to open.", callback);
});

exports.closeContext = paramAssertions.needsContextNameInParams('close', function closeContext (params, callback) {
	return this._openCloseContext(params, false, 'onClose', "No open context to close.", callback);
});
