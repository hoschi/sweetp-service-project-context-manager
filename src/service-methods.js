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
        returns: "Object or null."
    },
    fn: service.currentContext
};
