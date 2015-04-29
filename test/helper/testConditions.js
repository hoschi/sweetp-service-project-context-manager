var _ = require('lodash');
var arango = require('arangojs');
var async = require('async');
var should = require('chai').should();
var R = require('ramda');

var dbHelper = require('../../src/dbHelper');

exports.testDbName = 'sweetpUnittest';
exports.testDbUrl = 'http://localhost:8529/';

exports.getBaseParams = function () {
	return _.cloneDeep({
		url: 'http://localhost:1234/',
		config: {
			name: 'test'
		}
	});
};

exports.configureService = function (serviceInstance, callback) {
	var nconf;

	nconf = serviceInstance.__get__('nconf');
	nconf.defaults({
		dbConnection: this.testDbUrl + this.testDbName
	});
	serviceInstance.__set__('db', serviceInstance.__get__("initDb")(callback));
};

exports.getDb = function () {
	return arango.Connection(this.testDbUrl + this.testDbName);
};

exports.recreateDb = function (done) {
	var db;

	db = arango.Connection(this.testDbUrl);
	db.database.delete(this.testDbName, function (err, response) {
		// can't delete not existing db
		if (err && response.code !== 404) {
			throw new Error(response.errorMessage);
		}

		db.database.create(this.testDbName, [{
			username: 'test'
		}], function (err, response) {
				if (err) {
					throw new Error(response.errorMessage);
				}

				done();
			}.bind(this));
	}.bind(this));
};

exports.deleteAllContexts = function (callback) {
	var db;
	db = this.getDb();
	db.simple.list(dbHelper.contextsCollectionName, function (err, response) {
		should.not.exist(err);

		// delete them
		async.each(response.result.map(R.prop('_id')), db.document.delete, function (err) {
			should.not.exist(err);
			callback();
		});
	});
};

