var url = require('url');
var nock = require('nock');
var should = require('chai').should();

exports.mockWithContext  = function (params, serviceName) {
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
};

exports.mockWithContextAndSucceed  = function (params, serviceName) {
	return this.mockWithContext(params, serviceName)
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
};

exports.mockWithContextAndFail  = function (params, serviceName, failAt, index) {
	var scope;

	scope = this.mockWithContext(params, serviceName);

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
};


