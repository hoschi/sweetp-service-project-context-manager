var sweetp = require("sweetp-base");
var service = require("./service");

exports.current = {
    options: {
        params: {
            config: sweetp.PARAMETER_TYPES.projectConfig
        },
        description: {
            summary: "Get details about the current context."
        },
        returns: "Context information object or undefined when there is no active context."
    },
    fn: service.currentContext
};

exports.activate = {
    options: {
        params: {
            url: sweetp.PARAMETER_TYPES.url,
            config: sweetp.PARAMETER_TYPES.projectConfig,
            name: sweetp.PARAMETER_TYPES.one
        },
        description: {
            summary: "Activate a context by its name. No *other* context should be active!",
			config:[
				"(onActivate String[]): service names to call when activating a context, each service call gets one parameter 'context' with the stringified JSON of the context."
			]
        },
        returns: "Returns {msg:'success', (serviceHandlerResponses:[/*messages of service resplies */ ])}  when all went fine."
    },
    fn: service.activateContext
};

exports.deactivate = {
    options: {
        params: {
            url: sweetp.PARAMETER_TYPES.url,
            config: sweetp.PARAMETER_TYPES.projectConfig
        },
        description: {
            summary: "Deactivate the current context."
        },
        returns: "Returns an object. Property 'msg' contains always the message. It tells you whether there was no active context or that it deactivated an active context. 'context' property is `undefined` when no context was active or the same object which you get with the `current` method."
    },
    fn: service.activateContext
};
