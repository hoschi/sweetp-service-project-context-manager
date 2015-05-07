var R = require('ramda');

var basicAssertion = R.curry(function (propertyName, errorMessage, wrappedFunction) {
	return function (params, callback) {
		if (!params[propertyName]) {
			return callback(new Error(errorMessage));
		}

		wrappedFunction.call(this, params, callback);
	};
});

exports.needsContextNameInParams = function (actionName, wrappedFunction) {
	return basicAssertion('name', "Can't " + actionName + " context without a name for it.", wrappedFunction);
};

exports.patchContextAssertions = function (wrappedFunction) {
	var propertiesAssert, idAssert, applyAll;

	propertiesAssert = basicAssertion('properties', "No properties provided to patch into context!");
	idAssert = basicAssertion('id', "No context id provided, to indentify context to patch!");

	applyAll = R.compose(idAssert, propertiesAssert);
	return applyAll(wrappedFunction);
};

