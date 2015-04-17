var _ = require('lodash');
var sinon = require('sinon');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');

var s = require('../src/service');

var baseParams = testConditions.getBaseParams();

before(testConditions.recreateDb.bind(testConditions));

testConditions.configureService(s);
describe('DB connection', function () {
	var params, setNotExistingDb;
	params = _.cloneDeep(baseParams);

	setNotExistingDb = function () {
		s.nconf.defaults({
			dbConnection: 'http://localhost:8529/should-not-exist'
		});
	};

	beforeEach(function (done) {
		sinon.stub(console, "error", function () {});
		syncTests.start(done);
	});

	afterEach(function () {
		console.error.restore();
		syncTests.stop();
	});

	it('string can be overriden.', function (done) {
		s.nconf.get('dbConnection').should.equal('http://localhost:8529/sweetpUnittest');
		done();
	});

	it('should not fail with not existing DB.', function (done) {
		var db;
		setNotExistingDb();

		db = s.getDb(function (err) {
			db.should.be.a('object');
			err.message.should.match(/database not found/);

			testConditions.configureService(s);
			delete s._db;
			done();
		});
	});

	it('should not fail with not existing DB and no callback for error handling.', function (done) {
		var db;
		setNotExistingDb();

		db = s.getDb();
		db.should.be.a('object');
		testConditions.configureService(s);
		delete s._db;
		done();
	});

	it('should create collection if it not exists.', function (done) {
		s.getDb(function (err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("Collection created.");
			delete s._db;
			done();
		});
	});

	it('should not create collection when it exist.', function (done) {
		s.getDb(function (err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("All fine.");
			delete s._db;
			done();
		});
	});
});


