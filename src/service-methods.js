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
            config: sweetp.PARAMETER_TYPES.projectConfig,
            name: sweetp.PARAMETER_TYPES.one
        },
        description: {
            summary: "Activate a context by its name. No *other* context should be active!"
        },
        returns: "Returns 'sucess' when all went fine."
    },
    fn: service.activateContext
};

exports.deactivate = {
    options: {
        params: {
            config: sweetp.PARAMETER_TYPES.projectConfig
        },
        description: {
            summary: "Deactivate the current context."
        },
        returns: "Returns an object. Property 'msg' contains always the message. It tells you whether there was no active context or that it deactivated an active context. 'context' property is `undefined` when no context was active or the same object which you get with the `current` method."
    },
    fn: service.activateContext
};
