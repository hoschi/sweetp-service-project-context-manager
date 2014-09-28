'use strict';

module.exports = function (grunt) {
	// Show elapsed time at the end
	//require('time-grunt')(grunt);
	// Load all grunt tasks
	require('load-grunt-tasks')(grunt);

	// Project configuration.
	grunt.initConfig({
		jshint: {
			options: {
				jshintrc: '.jshintrc',
				reporter: require('jshint-stylish')
			},
			gruntfile: {
				src: 'Gruntfile.js'
			},
			src: {
				src: ['src/**/*.js']
			},
			test: {
				src: ['test/**/*.js']
			}
		},
		codeclimate: {
			options: {
				file: 'reports/coverage.lcov',
				token: 'adac2edae0766916a6fbb11fc84ac4bb5d7c356486d3b7a8dc42b7ba23a2dff0'
			}
		},
		mochacov: {
			options: {
				files: '<%= jshint.test.src %>'
			},
			unit: {
				options: {
					reporter: 'dot'
				}
			},
			coverage: {
				options: {
					reporter: 'html-cov',
					output: 'reports/coverage.html'
				}
			},
			lcov: {
				options: {
					instrument: true,
					reporter: 'mocha-lcov-reporter',
					output: 'reports/coverage.lcov'
				}
			}
		},
		watch: {
			gruntfile: {
				files: '<%= jshint.gruntfile.src %>',
				tasks: ['jshint:gruntfile']
			},
			src: {
				files: '<%= jshint.src.src %>',
				tasks: ['jshint:src', 'mochacov:unit']
			},
			test: {
				files: [
					'<%= jshint.src.src %>',
					'<%= jshint.test.src %>'
				],
				tasks: ['jshint', 'mochacov:unit']
			}
		}
	});

	grunt.registerTask('codec', ['mochacov:lcov', 'codeclimate']);
	grunt.registerTask('test', ['mochacov:unit']);
	grunt.registerTask('default', ['jshint', 'test']);
};
