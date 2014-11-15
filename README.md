[![Code Climate](https://codeclimate.com/github/hoschi/sweetp-service-project-context-manager/badges/gpa.svg)](https://codeclimate.com/github/hoschi/sweetp-service-project-context-manager) [![Test Coverage](https://codeclimate.com/github/hoschi/sweetp-service-project-context-manager/badges/coverage.svg)](https://codeclimate.com/github/hoschi/sweetp-service-project-context-manager) [![Stack Share](http://img.shields.io/badge/tech-stack-0690fa.svg?style=flat)](http://stackshare.io/hoschi/sweetp-service-project-context-manager)

Sweetp service to manage project context.

# Usage

You have to create the DB in your ArangoDB server named `sweetp` or configure another DB.

## Configuration

Configure DB by command line switch, e.g. `--dbConnection http://myotherhost:1234/sweetp-database`.

Enabled logging with `DEBUG=project-context-manager:* node ...` environment
variable. Set this (or other) environment variables before running sweetp
server to enable loging in production.

# Development

Create DB 'sweetpUnittest' for tests.

You want to clone and link
[branch 2.2 of arango client](https://github.com/triAGENS/ArangoDB-JavaScript/commits/2.2)
instead of the npm version to see assertion errors in tests.

# License

Copyright (c) 2014 Stefan Gojan.
Licensed under the MIT license.
