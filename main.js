var sweetp = require("sweetp-base");
var service = require("./src/service-methods.js");
var methods, client;

methods = sweetp.createMethods(service, "/project-context/");
client = sweetp.start("project-context-manager", methods);
