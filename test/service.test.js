var should = require('chai').should();
var _ = require('lodash');
var sinon = require('sinon');
var nock = require('nock');
var rewire = require('rewire');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');

var dbHelper = require('../src/dbHelper');

var s = rewire('../src/service');

var baseParams = testConditions.getBaseParams();
testConditions.configureService(s);

describe('Service method to get current context', function () {
	var params;
	params = _.cloneDeep(baseParams);

before(function (done) {
	syncTests.start(function () {
		testConditions.recreateDb(function () {
			syncTests.stop();
			done();
		});
	});
});

	beforeEach(function (done) {
		syncTests.start(function () {
			testConditions.configureService(s, done);
		});
	});

	afterEach(function (done) {
		testConditions.deleteAllContexts(function () {
			nock.cleanAll();
			syncTests.stop();
			done();
		});
	});

	it('should return message when no context is active.', function (done) {
		s.currentContext(params, function (err, data) {
			should.not.exist(err);
			should.equal(data, "no active context");
			done();
		});
	});

	it('should return information about the active context when there is one.', function (done) {
		s.activateContext(_.assign({
			name: 'my-context'
		}, params), function (err, data) {
				should.not.exist(err);
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);

				s.currentContext(params, function (err, data) {
					should.not.exist(err);
					data.isActive.should.equal(true);
					data.projectName.should.equal('test');
					data.name.should.equal('my-context');
					done();
				});
			});
	});

	it('should return message after deactivating current context.', function (done) {
		var db, contextName;

		contextName = 'test';
		db = s.__get__('db');
		db.document.create(dbHelper.contextsCollectionName, {
			isActive: true,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				s.deactivateContext(params, function (err, data) {
					should.not.exist(err);
					data.msg.should.equal("Context deactivated.");
					s.currentContext(params, function (err, data) {
						should.not.exist(err);
						should.equal(data, "no active context");
						done();
					});
				});
			});
	});
});

describe('Service method to patch existing context', function () {
	beforeEach(function (done) {
		syncTests.start(function () {
			testConditions.configureService(s, done);
		});
	});

	afterEach(function (done) {
		testConditions.deleteAllContexts(function () {
			nock.cleanAll();
			syncTests.stop();
			done();
		});
	});

	it('fails without contex id.', function (done) {
		s.patchContext({}, function (err) {
			err.message.should.match(/ id /);
			done();
		});
	});

	it('fails without properties to set.', function (done) {
		var params;

		params = {
			id: '1'
		};

		s.patchContext(params, function (err) {
			err.message.should.match(/ properties /);
			done();
		});
	});

	it('returns patched context response when successfull.', function (done) {
		s.__get__('db').document.create(dbHelper.contextsCollectionName, {
			isActive: true,
			name: 'my-active-context',
			projectName: 'test'
		}, function (err, response) {
				var params, contextId;
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}
				contextId = response._id;

				params = {
					id: contextId,
					properties: JSON.stringify({
						'foo': 'bar'
					})
				};

				s.patchContext(params, function (err, context) {
					should.not.exist(err);
					context._id.should.equal(contextId);
					done();
				});
			});
	});

	it('should pass DB error to callback.', function (done) {
		var mock, params;

		// mock db document API to provide error callback
		mock = sinon.mock(s.__get__('db').document);
		mock.expects("patch")
			.callsArgWith(2, "DB error when patching context!!!111einself");

		params = {
			id: "notExistingContextId",
			properties: JSON.stringify({
				'foo': 'bar'
			})
		};

		s.patchContext(params, function (err) {
			err.should.match(/DB error when patching context/);

			mock.restore();
			done();
		});
	});
});

