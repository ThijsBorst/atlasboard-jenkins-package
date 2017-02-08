var util = require('util'),
    cache = require('memory-cache');

/**
 * Job: jenkins-jobs
 * 
 * Configuration:
 *  {
 *      "interval": 10000,
 *      "timeout" : 5000,
 *      "endpoint": "url of the view, folder or root of jenkins",
 *  }
 */

module.exports = {

    onRun: function(config, dependencies, job_callback) {
        var credentials = config.credentials || 'jenkins';
        config.credentials = credentials;

        var logger = dependencies.logger;

        var cache_expiration = config.interval; //ms
        var cache_key = 'jenkins-buildqueue:config-' + JSON.stringify(config); // unique cache object per job config

        if (cache.get(cache_key)) {
            return job_callback(null, cache.get(cache_key));
        }

        fetchListOfJobs(config, dependencies)
            .then(function(result) {
                var data = result || {};

                data = filterJobs(config, data);

                cache.put(cache_key, data, cache_expiration);

                job_callback(null, data);
            }).catch(function(err) {
                job_callback(err.message);
            });
    }
};

function generateRequestOptionsForJenkins(config) {
    var options = {
        url: config.endpoint + '/api/json?tree=jobs[name,url,color,inQueue]',
        timeout: config.timeout || 5000,
        rejectUnauthorized: false
    };

    if (config.globalAuth && config.globalAuth[config.credentials]) {
        options.headers = {
            'authorization': 'Basic ' + new Buffer(
                config.globalAuth[config.credentials].username +
                ':' +
                config.globalAuth[config.credentials].password
            ).toString('base64')
        };
    }

    return options;
}

module.exports.fetchListOfJobs = fetchListOfJobs;

function fetchListOfJobs(config, dependencies) {
    return new Promise(
        function(resolve, reject) {
            var options = generateRequestOptionsForJenkins(config);
            dependencies.request(options, function(err, response, body) {
                if (err) {
                    reject(err);
                } else if (!response) {
                    reject(new Error('Bad response'));
                } else if (response.statusCode !== 200) {
                    reject(new Error(util.format('Bad status %s', response.statusCode)));
                } else {
                    try {
                        var bodyObj = JSON.parse(body);
                        resolve(bodyObj);
                    } catch (ex) {
                        reject(ex);
                    }
                }
            });
        }
    );
}

module.exports.filterJobs = filterJobs;

function filterJobs(config, data) {
    if (data.jobs) {
        var job = null;
        for (var i = data.jobs.length - 1; i >= 0; i--) {
            job = data.jobs[i];
            if (!job.inQueue) {
                data.jobs.splice(i, 1);
            }
        }
    }
    return data;
}