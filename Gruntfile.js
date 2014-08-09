'use strict';

module.exports = function(grunt) {
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
        mochacov: {
            options: {
				files: '<%= jshint.test.src %>'
            },
            unit:{
				options:{
					reporter: 'dot'
				}
			},
            coverage:{
				options:{
					reporter: 'html-cov',
					output: 'reports/coverage.html'
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

    // Default task.
	grunt.registerTask('test', ['mochacov:unit']);
    grunt.registerTask('default', ['jshint', 'test']);
};
