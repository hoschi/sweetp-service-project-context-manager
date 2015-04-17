var sinon = require('sinon');
require('chai');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');

var dbHelper = require('../src/dbHelper');

describe('Response error helper', function () {
	it('should include information from DB response.', function () {
		dbHelper.getErrorFromResponse("my error", {
			error: 'response error',
			code: 500,
			errorNum: 123,
			errorMessage: 'error message'
		}).message.should.equal("500 123 error message");
	});

	it('should handle also normal errors.', function () {
		dbHelper.getErrorFromResponse("my error").message.should.match(/my error/);
	});
});

describe('Callback lifting to better DB error handling', function () {
	it('should handle also normal errors.', function (done) {
		var liftedCallback;

		liftedCallback = dbHelper.liftDbError(function (err) {
			err.message.should.match(/my error/);
			done();
		});

		liftedCallback("my error");
	});

	it('should include information from DB response.', function (done) {
		var liftedCallback;

		liftedCallback = dbHelper.liftDbError(function (err) {
			err.message.should.equal("500 123 error message");
			done();
		});

		liftedCallback("my error", {
			error: 'response error',
			code: 500,
			errorNum: 123,
			errorMessage: 'error message'
		});
	});
});

describe('DB connection', function () {
	var notExistingConnection, connection;

	notExistingConnection = 'http://localhost:8529/should-not-exist';
	connection = testConditions.testDbUrl + testConditions.testDbName;

	before(function (done) {
		syncTests.start(function () {
			testConditions.recreateDb(function () {
				syncTests.stop();
				done();
			});
		});
	});

	beforeEach(function (done) {
		sinon.stub(console, "error", function () {});
		syncTests.start(done);
	});

	afterEach(function () {
		console.error.restore();
		syncTests.stop();
	});

	it('should not fail with not existing DB.', function (done) {
		dbHelper.initDb(notExistingConnection, function (err, response, db) {
			err.message.should.match(/database not found/);
			db.should.be.a('object');
			done();
		});
	});

	it('should not fail with not existing DB and no callback for error handling.', function () {
		var db;

		db = dbHelper.initDb(notExistingConnection);
		db.should.be.a('object');
	});

	it('should create collection if it not exists.', function (done) {
		dbHelper.initDb(connection, function (err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("Collection created.");
			done();
		});
	});

	it('should not create collection when it exist.', function (done) {
		dbHelper.initDb(connection, function (err, message) {
			if (err) {
				throw err;
			}

			message.should.equal("All fine.");
			done();
		});
	});
});
