var should = require('chai').should();
var _ = require('lodash');
var arango = require('arangojs');
var sinon = require('sinon');

var s = require('../src/service');

var testDbUrl, testDbName, nconfDefaults, baseParams;

testDbName = 'sweetpUnittest';
testDbUrl = 'http://localhost:8529/';
// override defaults
nconfDefaults = {
	dbConnection:testDbUrl + testDbName
};
s.nconf.defaults(nconfDefaults);

baseParams = {
	config: {
		name: 'test'
	}
};

before(function (done) {
	var db;
	// recreate db

	db = arango.Connection(testDbUrl);
	db.database.delete(testDbName, function(err, response) {
		// can't delete not existing db
		if (err && response.code !== 404) {
			throw new Error(response.errorMessage);
		}

		db.database.create(testDbName, [{username:'test'}], function(err, response) {
			if (err) {
				throw new Error(response.errorMessage);
			}

			done();
		});
	});
});

describe('DB connection', function () {
    var params, setNotExistingDb;
	params = _.cloneDeep(baseParams);

	setNotExistingDb = function () {
		s.nconf.defaults({
			dbConnection:'http://localhost:8529/should-not-exist'
		});
	};

	beforeEach(function () {
		sinon.stub(console, "error", function () {});
	});

	afterEach(function () {
		console.error.restore();
	});

	it('string can be overriden.', function () {
		s.nconf.get('dbConnection').should.equal('http://localhost:8529/sweetpUnittest');
	});

	it('should not fail with not existing DB.', function (done) {
		var db;
		setNotExistingDb();

		db = s.getDb(function(err) {
			db.should.be.a('object');
			err.message.should.match(/database not found/);

			s.nconf.defaults(nconfDefaults);
			delete s._db;
			done();
		});
	});

	it('should not fail with not existing DB and no callback for error handling.', function () {
		var db;
		setNotExistingDb();

		db = s.getDb();
		db.should.be.a('object');
		s.nconf.defaults(nconfDefaults);
		delete s._db;
	});

	it('should create collection if it not exists.', function (done) {
		s.getDb(function(err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("Collection created.");
			delete s._db;
			done();
		});
	});

	it('should not create collection when it exist.', function (done) {
		s.getDb(function(err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("All fine.");
			delete s._db;
			done();
		});
	});
});

describe('Service method to activate a context', function () {
    var params;
	params = _.cloneDeep(baseParams);

    it("doesn't handle errors.", function(done) {
        s.activateContext(true, undefined, function(err) {
            err.should.equal(true);
            done();
        });
    });

	it('should fail without context name.', function (done) {
        s.activateContext(null, params, function(err) {
			err.message.should.equal("Can't activate context without a name for it.");
            done();
        });
	});

	it('should return "success" when all went fine.', function (done) {
		s.activateContext(null, _.assign({name:'my-context'}, params), function (err, data) {
            should.not.exist(err);
			data.should.equal('success');
			done();
		});
	});

	it('should return "success" when contex is already active.', function (done) {
		s.activateContext(null, _.assign({name:'my-context'}, params), function (err, data) {
            should.not.exist(err);
			data.should.equal('success');
			done();
		});
	});

	it('should throw error when another context is active.', function (done) {
		s.activateContext(null, _.assign({name:'my-context-2'}, params), function (err) {
			err.message.should.equal("Active context detected! You must deactivate it, before activating another context.");
			done();
		});
	});

});

describe('Service method to deactivate a context', function () {
    var params;
	params = _.cloneDeep(baseParams);

	it('should return deactivated context.', function (done) {
		s.deactivateContext(null, params, function (err, data) {
            should.not.exist(err);
			data.msg.should.equal("Context deactivated.");
			data.context.isActive.should.equal(false);
			data.context.projectName.should.equal('test');
			data.context.name.should.equal('my-context');
			done();
		});
	});

	it('should return only message when there was no context to deactivate.', function (done) {
		s.deactivateContext(null, params, function (err, data) {
            should.not.exist(err);
			data.msg.should.equal("No active context.");
            should.not.exist(data.context);
			done();
		});
	});

});

describe('Service method to get current context', function() {
    var params;
	params = _.cloneDeep(baseParams);

    it("doesn't handle errors.", function(done) {
        s.currentContext(true, undefined, function(err) {
            err.should.equal(true);
            done();
        });
    });

    it('should return undefined when no context is active.', function(done) {
        s.currentContext(null, params, function(err, data) {
            should.not.exist(err);
			should.equal(data, undefined);
            done();
        });
    });

	it('should return information about the active context when there is one.', function (done) {
		s.activateContext(null, _.assign({name:'my-context'}, params), function (err, data) {
            should.not.exist(err);
			data.should.equal('success');

			s.currentContext(null, params, function(err, data) {
				should.not.exist(err);
				data.isActive.should.equal(true);
				data.projectName.should.equal('test');
				data.name.should.equal('my-context');
				done();
			});
		});
	});

    it('should return undefined after deactivating current context.', function(done) {
		s.deactivateContext(null, params, function (err, data) {
            should.not.exist(err);
			data.msg.should.equal("Context deactivated.");
			s.currentContext(null, params, function(err, data) {
				should.not.exist(err);
				should.equal(data, undefined);
				done();
			});
		});
    });

});
