var arango = require('arangojs');
var async = require('async');
var log = require('./log');

exports.contextsCollectionName = 'projectContexts';

exports.liftDbError = function (callback) {
	return function (err, response, opaque) {
		return callback(this.getErrorFromResponse(err, response), response, opaque);
	}.bind(this);
};

exports.getErrorFromResponse = function (err, response) {
	if (response && response.error) {
		return new Error([response.code, response.errorNum, response.errorMessage].join(' '));
	} else if (err) {
		return new Error('Response callback error: ' + err.toString());
	} else {
		return null;
	}
};

exports.initDb = function (connection, callback) {
	var db;

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
					next(this.getErrorFromResponse(err, response), "Collection created.");
				}.bind(this));
			}
		}.bind(this)
	], function (err, response) {
			err = this.getErrorFromResponse(err, response);

			if (err) {
				log.error(err);
				if (callback) {
					return callback(err, response, db);
				}
			}

			if (callback) {
				return callback(undefined, response, db);
			}
		}.bind(this));

	return db;
};


