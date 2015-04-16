var _ = require('lodash');
var arango = require('arangojs');

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

exports.configureService = function (serviceInstance) {
	serviceInstance.nconf.defaults({
		dbConnection: this.testDbUrl + this.testDbName
	});
};

exports.recreateDb = function (done) {
	var db;
	// recreate db

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
