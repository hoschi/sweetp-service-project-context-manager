var should = require('chai').should();
var _ = require('lodash');
var sinon = require('sinon');
var nock = require('nock');
var rewire = require('rewire');
var async = require('async');
var R = require('ramda');

var syncTests = require('./helper/syncTests');
var testConditions = require('./helper/testConditions');
var serviceCallsMocker = require('./helper/mockServiceCalls');

var dbAbstraction = require('../src/dbAbstraction');
var dbHelper = require('../src/dbHelper');

var s = rewire('../src/service');

var baseParams = testConditions.getBaseParams();

describe('Service method to activate a context', function () {
	var params;
	params = _.cloneDeep(baseParams);

	// init DB one every test, so we can mock it
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
		s.activateContext(params, function (err) {
			err.message.should.equal("Can't activate context without a name for it.");
			done();
		});
	});

	it('should return "success" when all went fine, test with not exsting context.', function (done) {
		var db;
		db = s.__get__('db');
		// fetch all existing contexts
		db.simple.example(dbHelper.contextsCollectionName, {
			name: 'my-context'
		}, function (err, response) {
				should.not.exist(err);
				// delete them
				async.each(response.result.map(R.prop('_id')), db.document.delete, function (err) {
					should.not.exist(err);
					// activate context which not exists
					s.activateContext(_.assign({
						name: 'my-context'
					}, params), function (err, data) {
							should.not.exist(err);
							data.msg.should.equal('success');
							should.not.exist(data.serviceHandlerResponses);

							// check if it is really active
							s.currentContext(params, function (err, data) {
								should.not.exist(err);
								data.isActive.should.equal(true);
								data.isOpen.should.equal(true);
								data.name.should.equal('my-context');
								done();
							});
						});
				});
			});
	});

	it('should return "success" when all went fine, test with exsting context.', function (done) {
		var db;
		db = s.__get__('db');
		// fetch all existing contexts
		db.simple.example(dbHelper.contextsCollectionName, {
			name: 'my-context'
		}, function (err, response) {
				should.not.exist(err);
				// delete them
				async.each(response.result.map(R.prop('_id')), db.document.delete, function (err) {
					should.not.exist(err);
					// create our not active test context
					db.document.create(dbHelper.contextsCollectionName, {
						name: 'my-context',
						projectName: baseParams.config.name,
						isActive: false
					}, function (err, response) {
							should.not.exist(err);
							should.exist(response._id);

							// activate it
							s.activateContext(_.assign({
								name: 'my-context'
							}, params), function (err, data) {
									should.not.exist(err);
									data.msg.should.equal('success');
									should.not.exist(data.serviceHandlerResponses);

									// check if it is really active
									s.currentContext(params, function (err, data) {
										should.not.exist(err);
										data.isActive.should.equal(true);
										data.isOpen.should.equal(true);
										data.name.should.equal('my-context');
										done();
									});
								});
						});
				});
			});
	});

	it('should return "success" when contex is already active.', function (done) {
		s.activateContext(_.assign({
			name: 'my-context'
		}, params), function (err, data) {
				should.not.exist(err);
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);

				s.activateContext(_.assign({
					name: 'my-context'
				}, params), function (err, data) {
						should.not.exist(err);
						data.msg.should.equal('success');
						should.not.exist(data.serviceHandlerResponses);
						done();
					});
			});
	});

	it('should call all services which are configured to run on activation and save modified context in DB.', function (done) {
		var services, mockScopes, myParams, contextName, dbStub;

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
			onActivate: services
		};

		s.activateContext(_.assign({
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

				done();
			});
	});

	it('should call all services which are configured to run on activation and fail with DB error on context save.', function (done) {
		var services, mockScopes, myParams, contextName, dbStub;

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
			onActivate: services
		};

		s.activateContext(_.assign({
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

				done();
			});
	});

	it('should abort calling services on first failed service.', function (done) {
		var services, mockScopes, myParams;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2',
			'testservice/task3'
		];
		mockScopes = [];

		// create mock for each service (call)
		services.forEach(function (serviceName, index) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndFail(params, serviceName, 1, index);
			mockScopes.push(scope);
		});

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onActivate: services
		};

		s.activateContext(_.assign({
			name: 'my-context'
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
				done();
			});
	});

	it('should abort calling services when a DB error occures before.', function (done) {
		var services, mockScopes, myParams, mock;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2',
			'testservice/task3'
		];
		mockScopes = [];

		// create mock for each service (call)
		services.forEach(function (serviceName, index) {
			var scope;
			scope = serviceCallsMocker.mockWithContextAndFail(params, serviceName, 1, index);
			mockScopes.push(scope);
		});

		// mock db document API to provide error callback
		mock = sinon.mock(s.__get__('db').document);
		mock.expects("create")
			.callsArgWith(2, "DB error when creating context!!!111einself");

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onActivate: services
		};

		s.activateContext(_.assign({
			name: 'my-context-which-not-exists'
		}, myParams), function (err) {
				err.should.match(/DB error when creating context/);
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
				done();
			});
	});

	it('should throw error when another context is active.', function (done) {
		// activate context
		s.activateContext(_.assign({
			name: 'my-context-1'
		}, params), function (err, data) {
				should.not.exist(err);
				data.msg.should.equal('success');

				// second activation should fail
				s.activateContext(_.assign({
					name: 'my-context-2'
				}, params), function (err) {
						err.message.should.equal("Active context detected! You must deactivate it, before activating another context.");
						done();
					});
			});
	});
});

describe('Service method to activate a context for ticket', function () {
	var params;

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

	params = _.cloneDeep(baseParams);

	params.config.projectContextManager = {
		ticketContextNamePrefix: 'issue/'
	};

	it('should fail without ticket id.', function (done) {
		s.activateContextForTicket(params, function (err) {
			err.message.should.equal("Can't activate context for a ticket without a ticket id.");
			done();
		});
	});

	it('should has a default for context name prefix.', function (done) {
		var myParams, createContext;

		myParams = _.cloneDeep(params);
		myParams.ticketId = "42";

		createContext = function (callback) {
			s.activateContextForTicket(_.cloneDeep(myParams), function (err, data) {
				if (err) {
					throw err;
				}
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);

				dbAbstraction.getContexts(s.__get__('db'), myParams.config.name, 'ticket/42', true, undefined, function (err, result) {
					var doc;

					if (err) {
						throw err;
					}
					doc = _.first(result);
					doc.name.should.equal('ticket/42');
					doc.ticketId.should.equal('42');
					s.__get__('db').document.delete(doc._id, function (err) {
						if (err) {
							throw err;
						}
						callback();
					});

				});
			});
		};

		// test with service config, but without prefix
		delete myParams.config.projectContextManager.ticketContextNamePrefix;
		createContext(function () {

			// test with no service config at all
			delete myParams.config.projectContextManager;

			createContext(function () {
				done();
			});
		});
	});

	it('should take context name prefix from config.', function (done) {
		var myParams;

		myParams = _.cloneDeep(params);
		// use Number instead of String
		myParams.ticketId = 42;
		s.activateContextForTicket(_.cloneDeep(myParams), function (err, data) {
			if (err) {
				throw err;
			}
			data.msg.should.equal('success');
			should.not.exist(data.serviceHandlerResponses);
			dbAbstraction.getContexts(s.__get__('db'), myParams.config.name, 'issue/42', true, undefined, function (err, result) {
				var doc;

				if (err) {
					throw err;
				}
				result.should.have.length(1);
				doc = _.first(result);
				doc.name.should.equal('issue/42');
				doc.ticketId.should.equal('42');
				s.__get__('db').document.delete(doc._id, function (err) {
					if (err) {
						throw err;
					}
					done();
				});

			});
		});
	});

	it('should convert provided ticket id to string.', function (done) {
		var myParams;

		myParams = _.cloneDeep(params);
		// use default 'ticket' prefix
		delete myParams.config.projectContextManager.ticketContextNamePrefix;
		// use Number instead of String
		myParams.ticketId = 42;
		s.activateContextForTicket(_.cloneDeep(myParams), function (err, data) {
			if (err) {
				throw err;
			}
			data.msg.should.equal('success');
			should.not.exist(data.serviceHandlerResponses);
			dbAbstraction.getContexts(s.__get__('db'), myParams.config.name, 'ticket/42', true, undefined, function (err, result) {
				var doc;

				if (err) {
					throw err;
				}
				result.should.have.length(1);
				doc = _.first(result);
				doc.name.should.equal('ticket/42');
				doc.ticketId.should.equal('42');
				s.__get__('db').document.delete(doc._id, function (err) {
					if (err) {
						throw err;
					}
					done();
				});

			});
		});
	});
});


