var semaphore = require('semaphore')(1);
var R = require('ramda');

exports.start = function (done) {
	semaphore.take(R.nAry(0, done));
};

exports.stop = function () {
	semaphore.leave();
};
