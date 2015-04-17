/*jshint -W030 */
var should = require('chai').should();
var async = require('async');
var R = require('ramda');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');

var dbHelper = require('../src/dbHelper');
var dbAbstraction = require('../src/dbAbstraction');

var db;
var projectName;
db = testConditions.getDb();
projectName = testConditions.getBaseParams().config.name;

var nullary = R.nAry(0);

before(function (done) {
	function recreateDb (next) {
		testConditions.recreateDb(next);
	}

	function initDb (next) {
		dbHelper.initDb(testConditions.testDbUrl + testConditions.testDbName, nullary(next));
	}

	function createDocuments (next) {
		var jobs;
		jobs = [{
			isActive: false,
			isOpen: false,
			name: 'context-1',
			projectName: projectName
		}, {
			isActive: false,
			isOpen: false,
			name: 'context-2',
			projectName: projectName
		}, {
			isActive: true,
			isOpen: true,
			name: 'context-3',
			projectName: projectName
		}, {
			isActive: false,
			isOpen: true,
			name: 'context-4',
			projectName: projectName
		}].map(function (doc) {
			return R.partial(db.document.create, dbHelper.contextsCollectionName, doc);
		});

		async.parallel(jobs, next);
	}

	async.waterfall([syncTests.start, recreateDb, initDb, createDocuments, function (response, next) {
		syncTests.stop();
		next();
	}], nullary(done));
});

describe('Get contexts from DB', function () {
	beforeEach(function (done) {
		syncTests.start(done);
	});

	afterEach(function () {
		syncTests.stop();
	});

	it("should return empty array when it doesn't find any context.", function (done) {
		dbAbstraction.getContexts(db, "myNotExistingProject", undefined, undefined, undefined, function (err, result) {
			should.not.exist(err);
			result.should.be.empty;
			done();
		});
	});

	it('should fetch all contexts for a project.', function (done) {
		dbAbstraction.getContexts(db, projectName, undefined, undefined, undefined, function (err, result) {
			should.not.exist(err);
			result.should.have.length(4);
			done();
		});
	});

	it('should fetch a context by name.', function (done) {
		var contextName;
		contextName = 'context-2';
		dbAbstraction.getContexts(db, projectName, contextName, undefined, undefined, function (err, result) {
			should.not.exist(err);
			result.should.have.length(1);
			result[0].name.should.equal(contextName);
			done();
		});
	});

	it('should fetch a context by "isActive" property.', function (done) {
		dbAbstraction.getContexts(db, projectName, undefined, true, undefined, function (err, result) {
			should.not.exist(err);
			result.should.have.length(1);
			result[0].name.should.equal('context-3');
			result[0].isActive.should.equal(true);

			dbAbstraction.getContexts(db, projectName, undefined, false, undefined, function (err, result) {
				should.not.exist(err);
				result.should.have.length(3);
				done();
			});
		});
	});

	it('should fetch a context by "isOpen" property.', function (done) {
		dbAbstraction.getContexts(db, projectName, undefined, undefined, true, function (err, result) {
			should.not.exist(err);
			result.should.have.length(2);
			result[0].isOpen.should.equal(true);
			result[1].isOpen.should.equal(true);

			dbAbstraction.getContexts(db, projectName, undefined, undefined, false, function (err, result) {
				should.not.exist(err);
				result.should.have.length(2);
				result[0].isOpen.should.equal(false);
				result[1].isOpen.should.equal(false);
				done();
			});
		});
	});
});

