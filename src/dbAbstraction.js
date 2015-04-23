var dbHelper = require('./dbHelper');
var _ = require('lodash');

exports.getContexts = function (db, projectName, name, isActive, isOpen, callback) {
	var filter, env;

	filter = "context.projectName == @projectName";
	env = {
		projectName: projectName
	};

	if (name !== undefined) {
		filter += " && context.name == @name";
		env.name = name;
	}

	if (isActive !== undefined) {
		filter += " && context.isActive == @isActive";
		env.isActive = isActive;
	}

	if (isOpen !== undefined) {
		filter += " && context.isOpen == @isOpen";
		env.isOpen = isOpen;
	}

	db.query.for('context').in(dbHelper.contextsCollectionName)
		.filter(filter)
		.return('context')
		.exec(env, function (err, response) {
			callback(dbHelper.getErrorFromResponse(err, response), response.result);
		}.bind(this));
};

exports.currentContext = function (db, projectName, callback) {
	this.getContexts(db, projectName, undefined, true, true, function (err, result) {
		var context;
		context = _.first(result);
		callback(err, context);
	});
};

