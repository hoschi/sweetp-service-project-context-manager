var should = require('chai').should();
var _ = require('lodash');
var arango = require('arangojs');
var sinon = require('sinon');
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

			shortContext = "context={name:" + context.name + "}";
			return parsed.pathname + "?" + shortContext;
		})
		.get('/services/' + params.config.name + '/' + serviceName + '?context={name:my-context}')
		.reply(200, {
			service: serviceName + " reply"
		});
}

function mockServiceCallWithContextAndFail (params, serviceName, failAt, index) {
	var scope;

	scope = nock(params.url)
		.filteringPath(function (path) {
			// mock stringified context to short version
			var parsed, context, shortContext;

			parsed = url.parse(path, true);
			context = JSON.parse(parsed.query.context);

			if (!context || !context.name) {
				return path;
			}

			shortContext = "context={name:" + context.name + "}";
			return parsed.pathname + "?" + shortContext;
		})
		.get('/services/' + params.config.name + '/' + serviceName + '?context={name:my-context}');

	if (index === failAt) {
		scope.reply(500, {
			service: "wahhhh"
		});
	} else {
		scope.reply(200, {
			service: serviceName + " reply"
		});
	}

	return scope;
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

		db = s.getDb(function (err) {
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

	it('should fail without context name.', function (done) {
		s.activateContext(params, function (err) {
			err.message.should.equal("Can't activate context without a name for it.");
			done();
		});
	});

	it('should return "success" when all went fine.', function (done) {
		s.activateContext(_.assign({
			name: 'my-context'
		}, params), function (err, data) {
				should.not.exist(err);
				data.msg.should.equal('success');
				should.not.exist(data.serviceHandlerResponses);
				done();
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

	it('should call all services which are configured to run on activation.', function (done) {
		var services, mockScopes, myParams;

		// services to call
		services = [
			'testservice/task1',
			'testservice/task2'
		];
		mockScopes = [];

		// create mock for each service (call)
		services.forEach(function (serviceName) {
			var scope;
			scope = mockServiceCallWithContext(params, serviceName);
			mockScopes.push(scope);
		});

		myParams = _.cloneDeep(params);
		myParams.config.projectContextManager = {
			onActivate: services
		};

		s.activateContext(_.assign({
			name: 'my-context'
		}, myParams), function (err, data) {
				should.not.exist(err);

				data.msg.should.equal('success');
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

	it('should throw error when another context is active.', function (done) {
		s.activateContext(_.assign({
			name: 'my-context-2'
		}, params), function (err) {
				err.message.should.equal("Active context detected! You must deactivate it, before activating another context.");
				done();
			});
	});

	after(function (done) {
		deactivateCurrentContext(params, done);
	});
});

describe('Service method to activate a context for ticket', function () {
	var params;

	before(function (done) {
		s.getDb(done);
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

	before(function (done) {
		// create context we can deactivate
		s.getDb().document.create(s.contextsCollectionName, {
			isActive: true,
			name: 'my-active-context',
			projectName: 'test'
		}, function (err, response) {
				if (err) {
					throw new Error(s._getErrorFromResponse(err, response));
				}
				done();
			});
	});

	it('should return deactivated context.', function (done) {
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
				var services, mockScopes, myParams;

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
					scope = mockServiceCallWithContext(params, serviceName);
					mockScopes.push(scope);
				});

				myParams = _.cloneDeep(params);
				myParams.config.projectContextManager = {
					onDeactivate: services
				};

				s.deactivateContext(myParams, function (err, data) {
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
	var contextId;

	before(function (done) {
		// create context we can patch
		s.getDb(function (err, response, db) {
			db.document.create(s.contextsCollectionName, {
				isActive: true,
				name: 'my-active-context',
				projectName: 'test'
			}, function (err, response) {
					if (err) {
						throw new Error(s._getErrorFromResponse(err, response));
					}
					contextId = response._id;
					done();
				});
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
		var params;

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

