var should = require('chai').should();
var _ = require('lodash');
var sinon = require('sinon');
var nock = require('nock');
var rewire = require('rewire');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');
var serviceCallsMocker = require('./helper/mockServiceCalls');

var dbHelper = require('../src/dbHelper');

var s = rewire('../src/service');

var baseParams = testConditions.getBaseParams();

describe('Service method to close a context', function () {
	var params;
	params = _.cloneDeep(baseParams);

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

	it('should fail without context name.', function (done) {
		s.closeContext(params, function (err) {
			err.message.should.equal("Can't close context without a name for it.");
			done();
		});
	});

	it('should change the `isOpen` property to `false` when closeing a closed context.', function (done) {
		var contextName, db;

		contextName = 'my-context';
		db = s.__get__('db');

		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				params.name = contextName;

				s.closeContext(params, function (err, data) {
					should.not.exist(err);
					data.msg.should.equal('success');
					should.not.exist(data.serviceHandlerResponses);

					// check properties
					db.simple.example(dbHelper.contextsCollectionName, {
						name: contextName
					}, function (err, response) {
							var context;
							should.not.exist(err);
							context = _.first(response.result);
							should.not.exist(err);
							context.isOpen.should.equal(false);
							context.name.should.equal(contextName);

							testConditions.deleteAllContexts(done);
						});
				});
			});
	});

	it('should only close closed contexts.', function (done) {
		var contextName, db;

		contextName = 'my-context';
		db = s.__get__('db');

		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: false,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				params.name = contextName;

				s.closeContext(params, function (err, data) {
					should.not.exist(err);
					data.msg.should.equal('No open context to close.');
					should.not.exist(data.serviceHandlerResponses);

					// check properties
					db.simple.example(dbHelper.contextsCollectionName, {
						name: contextName
					}, function (err, response) {
							var context;
							should.not.exist(err);
							context = _.first(response.result);
							should.not.exist(err);
							context.isOpen.should.equal(false);
							context.name.should.equal(contextName);

							testConditions.deleteAllContexts(done);
						});
				});
			});
	});

	it('should call all services which are configured to run on closeing and save modified context in DB.', function (done) {
		var services, mockScopes, myParams, contextName, dbStub, db;

		contextName = 'my-context';

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2'
		];
		mockScopes = [];

		// create mock for each service (call)
		services.forEach(function (serviceName) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndSucceed(params, serviceName);
			mockScopes.push(scope);
		});

		// mock db document API
		dbStub = sinon.stub(s.__get__('db').document, "put", function (id, data, callback) {
			id.should.equal("no-id");

			// check we got a context which foo prop has the value of the last service call
			data.foo.should.equal('testservice/task2 context prop');
			callback();
		});

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onClose: services
		};

		db = s.__get__('db');
		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				s.closeContext(_.assign({
					name: contextName
				}, myParams), function (err, data) {
						var i, scope;
						dbStub.restore();
						should.not.exist(err);

						data.msg.should.equal('success');
						data.serviceHandlerResponses.should.have.length(2);
						data.serviceHandlerResponses[0].should.equal("testservice/task1 reply");
						data.serviceHandlerResponses[1].should.equal("testservice/task2 reply");

						// check for pending mocks
						for (i = 0; i < mockScopes.length; i++) {
							scope = mockScopes[i];
							scope.isDone().should.equal(true);
						}

						testConditions.deleteAllContexts(done);
					});
			});
	});

	it('should call all services which are configured to run on activation and fail with DB error on context save.', function (done) {
		var services, mockScopes, myParams, contextName, dbStub, db;

		contextName = 'my-context';

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2'
		];
		mockScopes = [];

		// create mock for each service (call)
		services.forEach(function (serviceName) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndSucceed(params, serviceName);
			mockScopes.push(scope);
		});

		// mock db document API to provide error callback
		dbStub = sinon.stub(s.__get__('db').document, "put")
			.callsArgWith(2, "DB error when putting context!!!111einself");

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onClose: services
		};

		db = s.__get__('db');
		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				s.closeContext(_.assign({
					name: contextName
				}, myParams), function (err) {
						var i, scope;

						dbStub.restore();

						err.should.match(/testservice\/task1 reply/);
						err.should.match(/testservice\/task2 reply/);
						err.should.match(/there was an error when saving context/);
						err.should.match(/DB error when putting context!!!111einself/);
						err.should.match(/services ran without errors/);

						// check for pending mocks
						for (i = 0; i < mockScopes.length; i++) {
							scope = mockScopes[i];
							scope.isDone().should.equal(true);
						}

						testConditions.deleteAllContexts(done);
					});
			});
	});

	it('should abort calling services on first failed service.', function (done) {
		var services, mockScopes, myParams, db, contextName;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2',
			'testservice/task3'
		];
		mockScopes = [];
		contextName = 'my-context';

		// create mock for each service (call)
		services.forEach(function (serviceName, index) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndFail(params, serviceName, 1, index);
			mockScopes.push(scope);
		});

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onClose: services
		};

		db = s.__get__('db');
		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				s.closeContext(_.assign({
					name: contextName
				}, myParams), function (err) {
						err.should.match(/wahhhh/);
						err.should.match(/task1 reply/);
						err.should.not.match(/task3 reply/);

						// check for pending mocks
						mockScopes.forEach(function (scope) {
							if (scope.isDone) {
								scope.isDone().should.equal(true);
							}
						});
						testConditions.deleteAllContexts(done);
					});
			});
	});

	it('should abort calling services when a DB error occures before.', function (done) {
		var services, mockScopes, myParams, mock, contextName, db;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2',
			'testservice/task3'
		];
		mockScopes = [];
		contextName = 'my-context';

		// create mock for each service (call)
		services.forEach(function (serviceName, index) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndFail(params, serviceName, 1, index);
			mockScopes.push(scope);
		});

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onClose: services
		};

		db = s.__get__('db');
		db.document.create(dbHelper.contextsCollectionName, {
			isActive: false,
			isOpen: true,
			name: contextName,
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}

				// mock db document API to provide error callback
				mock = sinon.mock(s.__get__('db').document);
				mock.expects("patch")
					.callsArgWith(2, "DB error when patching context!!!111einself");

				s.closeContext(_.assign({
					name: 'my-context-which-not-exists'
				}, myParams), function (err) {
						err.should.match(/DB error when patching context/);
						err.should.not.match(/task1 reply/);
						err.should.not.match(/task3 reply/);
						err.should.not.match(/wahhhh/);

						// check for pending mocks
						mockScopes.forEach(function (scope) {
							if (scope.isDone) {
								scope.isDone().should.equal(true);
							}
						});
						mock.verify();
						mock.restore();
						testConditions.deleteAllContexts(done);
					});
			});
	});

});
