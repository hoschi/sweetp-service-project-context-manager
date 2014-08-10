var arango = require('arangojs');
var async = require('async');
var _ = require('lodash');

exports.getDb = function () {
	if (exports._db) {
		return exports._db;
	}

	exports._db = arango.Connection('http://localhost:8529/sweetp-dev');
	return exports._db;
};

exports.getContexts = function (projectName, name, isActive, callback) {
	var filter, env;

	filter = "context.projectName == @projectName";
	env = {projectName:projectName, name:name};

	if (name !== undefined) {
		filter += " && context.name == @name";
		env.name = name;
	}

	if (isActive !== undefined) {
		filter += " && context.isActive == @isActive";
		env.isActive = isActive;
	}

	exports.getDb().query.for('context').in('projectContexts')
		.filter(filter)
		.return('context')
		.exec(env, function (err, response) {
			if (err) { return callback(err); }
			callback(null, response.result);
		});
};

exports.deactivateContext = function (err, params, serviceMethodCallback) {
	var projectName;

    if (err) { return serviceMethodCallback(err); }

	projectName = params.config.name;

	async.waterfall([
		function (callback) {
			exports.currentContext(null, params, callback);
		},
		function (context, callback) {
			if (context) {
				// update
				context.isActive = false;
				exports.getDb().document.patch(context._id, {
					isActive:context.isActive
				}, function (err) {
					if (err) { return callback(err); }
					callback(null, {
						msg:"Context deactivated.",
						context:context
					});
				});
			} else {
				// no active context found
				callback(null, {
					msg:"No active context."
				});
			}
		}
	], serviceMethodCallback);

};

exports.activateContext = function (err, params, callback) {
	var projectName, name;

    if (err) { return callback(err); }

	projectName = params.config.name;
	name = params.name;

	if (!name) {
		return callback(new Error("Can't activate context without a name for it."));
	}

	async.waterfall([
		function (next) {
			exports.currentContext(null, params, next);
		},
		function (context, next) {
			if (context && context.name !== name) {
				return next(new Error("Active context detected! You must deactivate it, before activating another context."));
			}

			exports.getContexts(projectName, name, undefined, function (err, result) {
				if (err) { return next(err); }
				next(null, _.first(result));
			});
		},
		function (context, next) {
			if (context) {
				// update
				exports.getDb().document.patch(context._id, {
					isActive:true
				}, function (err) {
					if (err) { return next(err); }
					next(null, 'success');
				});
			} else {
				// create
				exports.getDb().document.create('projectContexts', {
					projectName:projectName,
					name:name,
					isActive:true
				}, function (err) {
					if (err) { return next(err); }
					next(null, 'success');
				});
			}
		}
	], callback);

};

exports.currentContext = function (err, params, callback) {
	var projectName;

    if (err) { return callback(err); }

	projectName = params.config.name;

	exports.getContexts(projectName, undefined, true, function (err, result) {
		if (err) { return callback(err); }
		callback(null, _.first(result));
	});
};
