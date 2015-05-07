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

describe('Service method to deactivate a context', function () {
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


	it('should return deactivated context.', function (done) {
		// create context we can deactivate
		s.__get__('db').document.create(dbHelper.contextsCollectionName, {
			isActive: true,
			name: 'my-active-context',
			isOpen: true,
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
					scope = serviceCallsMocker.mockWithContextAndSucceed(params, serviceName);
					mockScopes.push(scope);
				});

				// mock db document API to provide error callback
				dbStub = sinon.stub(s.__get__('db').document, "put", function (id, data, callback) {
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
					scope = serviceCallsMocker.mockWithContextAndFail(params, serviceName, 1, index);

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

