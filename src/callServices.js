var _ = require('lodash');
var async = require('async');
var sweetp = require('sweetp-base');
var log = require('./log');
var dbHelper = require('./dbHelper');

function mapWith (fn) {
	return function (list) {
		return _.map(list, fn);
	};
}

module.exports = function callServices (serviceNames, db, url, project, context, callback) {
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
};


