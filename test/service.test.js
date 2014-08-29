var should = require('chai').should();
var _ = require('lodash');

var s = require('../src/service');

var baseParams = {
	config: {
		name: 'test'
	}
};

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
