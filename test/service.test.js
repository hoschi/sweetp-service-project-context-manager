var should = require('chai').should();
var _ = require('lodash');
var arango = require('arangojs');
var sinon = require('sinon');
var async = require('async');
var R = require('ramda');
var nock = require('nock');
var url = require('url');

var s = require('../src/service');

var testDbUrl, testDbName, nconfDefaults, baseParams;

testDbName = 'sweetpUnittest';
testDbUrl = 'http://localhost:8529/';
// override defaults
nconfDefaults = {
	dbConnection: testDbUrl + testDbName
};
s.nconf.defaults(nconfDefaults);

baseParams = {
	url: 'http://localhost:1234/',
	config: {
		name: 'test'
	}
};

function deactivateCurrentContext (params, callback) {
	s.getContexts(params.config.name, undefined, true, function (err, result) {
		var doc;

		if (err) {
			throw err;
		}
		doc = _.first(result);

		if (doc) {
			s.getDb().document.delete(doc._id, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}
				callback();
			});
		} else {
			callback();
		}
	});
}

function mockServiceCallWithContext (params, serviceName) {
	return nock(params.url)
		.filteringPath(function (path) {
			// mock stringified context to short version
			var parsed, context, shortContext;

			parsed = url.parse(path, true);
			context = JSON.parse(parsed.query.context);

			if (!context || !context.name) {
				return path;
			}

			// assertions for context
			should.exist(context._id, "Supplied context should have an id for manuplating it.");

			shortContext = "context={name:" + context.name + "}";
			return parsed.pathname + "?" + shortContext;
		})
		.get('/services/' + params.config.name + '/' + serviceName + '?context={name:my-context}');
}

function mockServiceCallWithContextAndSucceed (params, serviceName) {
	return mockServiceCallWithContext(params, serviceName)
		.reply(200, {
			service: {
				msg: serviceName + " reply",
				// each service call gives a context back, which has
				// another foo property value.
				context: {
					_id: 'no-id',
					name: 'my-context',
					foo: serviceName + " context prop"
				}
			}
		});
}

function mockServiceCallWithContextAndFail (params, serviceName, failAt, index) {
	var scope;

	scope = mockServiceCallWithContext(params, serviceName);

	if (index === failAt) {
		scope.reply(500, {
			service: {
				msg: "wahhhh"
			}
		});
	} else {
		scope.reply(200, {
			service: {
				msg: serviceName + " reply"
			}
		});
	}

	return scope;
}

var blocked = false;
var release;
function checkTestExecution (done) {
	if (blocked) {
		release = function () {
			blocked = false;
			nock.cleanAll();
			done();
		};
	} else {
		blocked = true;
		release = function () {
			blocked = false;
			nock.cleanAll();
		};
		done();
	}
}

before(function (done) {
	var db;
	// recreate db

	db = arango.Connection(testDbUrl);
	db.database.delete(testDbName, function (err, response) {
		// can't delete not existing db
		if (err && response.code !== 404) {
			throw new Error(response.errorMessage);
		}

		db.database.create(testDbName, [{
			username: 'test'
		}], function (err, response) {
				if (err) {
					throw new Error(response.errorMessage);
				}

				done();
			});
	});
});

describe('Response error helper', function () {
	it('should handle also normal errors.', function () {
		s._getErrorFromResponse("my error").message.should.match(/my error/);
	});
});

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
		checkTestExecution(done);
	});

	afterEach(function () {
		console.error.restore();
		release();
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

			s.nconf.defaults(nconfDefaults);
			delete s._db;
			done();
		});
	});

	it('should not fail with not existing DB and no callback for error handling.', function (done) {
		var db;
		setNotExistingDb();

		db = s.getDb();
		db.should.be.a('object');
		s.nconf.defaults(nconfDefaults);
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

describe('Service method to activate a context', function () {
	var params;
	params = _.cloneDeep(baseParams);

	// init DB one every test, so we can mock it
	beforeEach(function (done) {
		s.getDb(function () {
			checkTestExecution(done);
		});
	});

	afterEach(function (done) {
		deactivateCurrentContext(params, function () {
			release();
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
		db = s.getDb();
		// fetch all existing contexts
		db.simple.example(s.contextsCollectionName, {
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
								data.name.should.equal('my-context');
								done();
							});
						});
				});
			});
	});

	it('should return "success" when all went fine, test with exsting context.', function (done) {
		var db;
		db = s.getDb();
		// fetch all existing contexts
		db.simple.example(s.contextsCollectionName, {
			name: 'my-context'
		}, function (err, response) {
				should.not.exist(err);
				// delete them
				async.each(response.result.map(R.prop('_id')), db.document.delete, function (err) {
					should.not.exist(err);
					// create our not active test context
					db.document.create(s.contextsCollectionName, {
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
				done();
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
			scope = mockServiceCallWithContextAndSucceed(params, serviceName);
			mockScopes.push(scope);
		});

		// mock db document API
		dbStub = sinon.stub(s._db.document, "put", function (id, data, callback) {
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
			scope = mockServiceCallWithContextAndSucceed(params, serviceName);
			mockScopes.push(scope);
		});

		// mock db document API to provide error callback
		dbStub = sinon.stub(s._db.document, "put")
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
			scope = mockServiceCallWithContextAndFail(params, serviceName, 1, index);
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
			scope = mockServiceCallWithContextAndFail(params, serviceName, 1, index);
			mockScopes.push(scope);
		});

		// mock db document API to provide error callback
		mock = sinon.mock(s._db.document);
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
		s.getDb(function () {
			checkTestExecution(done);
		});
	});

	afterEach(function () {
		release();
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

				s.getContexts(myParams.config.name, 'ticket/42', true, function (err, result) {
					var doc;

					if (err) {
						throw err;
					}
					doc = _.first(result);
					doc.name.should.equal('ticket/42');
					doc.ticketId.should.equal('42');
					s.getDb().document.delete(doc._id, function (err) {
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
			s.getContexts(myParams.config.name, 'issue/42', true, function (err, result) {
				var doc;

				if (err) {
					throw err;
				}
				result.should.have.length(1);
				doc = _.first(result);
				doc.name.should.equal('issue/42');
				doc.ticketId.should.equal('42');
				s.getDb().document.delete(doc._id, function (err) {
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
			s.getContexts(myParams.config.name, 'ticket/42', true, function (err, result) {
				var doc;

				if (err) {
					throw err;
				}
				result.should.have.length(1);
				doc = _.first(result);
				doc.name.should.equal('ticket/42');
				doc.ticketId.should.equal('42');
				s.getDb().document.delete(doc._id, function (err) {
					if (err) {
						throw err;
					}
					done();
				});

			});
		});
	});

	after(function (done) {
		deactivateCurrentContext(params, done);
	});
});

describe('Service method to deactivate a context', function () {
	var params;
	params = _.cloneDeep(baseParams);

	beforeEach(function (done) {
		s.getDb(function () {
			checkTestExecution(done);
		});
	});

	afterEach(function () {
		release();
	});

	it('should return deactivated context.', function (done) {
		// create context we can deactivate
		s.getDb().document.create(s.contextsCollectionName, {
			isActive: true,
			name: 'my-active-context',
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}
				s.deactivateContext(params, function (err, data) {
					should.not.exist(err);
					data.msg.should.equal("Context deactivated.");
					data.context.isActive.should.equal(false);
					data.context.projectName.should.equal('test');
					data.context.name.should.equal('my-active-context');
					should.not.exist(data.serviceHandlerResponses);
					done();
				});
			});
	});

	it('should return only message when there was no context to deactivate.', function (done) {
		s.deactivateContext(params, function (err, data) {
			should.not.exist(err);
			data.msg.should.equal("No active context.");
			should.not.exist(data.context);
			should.not.exist(data.serviceHandlerResponses);
			done();
		});
	});

	it('should not call services when there was no context to deactivate.', function (done) {
		var services, myParams;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2'
		];

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onDeactivate: services
		};

		s.deactivateContext(params, function (err, data) {
			should.not.exist(err);
			data.msg.should.equal("No active context.");
			should.not.exist(data.context);
			should.not.exist(data.serviceHandlerResponses);
			done();
		});
	});

	it('should call all services which are configured to run on deactivation.', function (done) {
		// activate context to have one to deactivate
		s.activateContext(_.assign({
			name: 'my-context'
		}, params), function (err, data) {
				var services, mockScopes, myParams, dbStub;

				should.not.exist(err);
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);

				// services to call
				services = [
					'testservice/task1',
					'testservice/task2'
				];
				mockScopes = [];

				// create mock for each service (call)
				services.forEach(function (serviceName) {
					var scope;
					scope = mockServiceCallWithContextAndSucceed(params, serviceName);
					mockScopes.push(scope);
				});

				// mock db document API to provide error callback
				dbStub = sinon.stub(s._db.document, "put", function (id, data, callback) {
					id.should.equal("no-id");

					// check we got a context which foo prop has the value of the last service call
					data.foo.should.equal('testservice/task2 context prop');
					callback();
				});

				myParams = _.cloneDeep(params);
				myParams.config.projectContextManager = {
					onDeactivate: services
				};

				s.deactivateContext(myParams, function (err, data) {
					dbStub.restore();
					should.not.exist(err);

					data.msg.should.equal("Context deactivated.");
					data.serviceHandlerResponses.should.have.length(2);
					data.serviceHandlerResponses[0].should.equal("testservice/task1 reply");
					data.serviceHandlerResponses[1].should.equal("testservice/task2 reply");

					// check for pending mocks
					mockScopes.forEach(function (scope) {
						scope.isDone().should.equal(true);
					});
					done();
				});
			});
	});

	it('should abort calling services on first failed service.', function (done) {
		// activate context to have one to deactivate
		s.activateContext(_.assign({
			name: 'my-context'
		}, params), function (err, data) {
				var services, mockScopes, myParams;

				should.not.exist(err);
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);

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
					scope = mockServiceCallWithContextAndFail(params, serviceName, 1, index);

					mockScopes.push(scope);
				});

				myParams = _.cloneDeep(params);
				myParams.config.projectContextManager = {
					onDeactivate: services
				};

				s.deactivateContext(myParams, function (err) {
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
	});
});

describe('Service method to get current context', function () {
	var params;
	params = _.cloneDeep(baseParams);

	beforeEach(function (done) {
		s.getDb(function () {
			checkTestExecution(done);
		});
	});

	afterEach(function () {
		release();
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

describe('Service method to patch existing context', function () {
	beforeEach(function (done) {
		s.getDb(function () {
			checkTestExecution(done);
		});
	});

	afterEach(function () {
		release();
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
		s.getDb().document.create(s.contextsCollectionName, {
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
		mock = sinon.mock(s._db.document);
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
