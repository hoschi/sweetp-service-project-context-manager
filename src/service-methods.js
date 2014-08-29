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
