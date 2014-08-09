exports.currentContext = function (err, params, callback) {
	var project;

    if (err) { return callback(err); }

	project = params.config.name;

    // TODO load information from database

    return callback(null, null);
};
