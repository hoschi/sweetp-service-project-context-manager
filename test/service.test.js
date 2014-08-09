var should = require('chai').should();

var s = require('../src/service');

describe('Service method to get current context', function() {
    var params;

    params = {
        config: {
            name: 'test-github-issues'
        }
    };

    it("doesn't handle errors.", function(done) {
        s.currentContext(true, undefined, function(err) {
            err.should.equal(true);
            done();
        });
    });

    it('should fetch all tickets by default.', function(done) {
        s.currentContext(null, params, function(err, data) {
            should.not.exist(err);
            should.equal(data, null);
            done();
        });

    });
});
