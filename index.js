var IPFSRoot = 'QmekGPX9VMZR8UJ7qKYm8Q9u5kaL2sYTCnDZWRA2xNg3oi';

var platformMap = {
	linux_x64: 'linux64',
	linux_ia32: 'linux32',
	linux_arm: 'linuxarm',
	darwin_ia32: 'mac',
	darwin_x64: 'mac',
	win32_ia32: 'win32',
	win32_x64: 'win64'
}

var expand = require('expand-home-dir');

var ADH = function (bin) {
    this.commonPath = [
	'/usr/bin/',
	'/usr/local/bin',
	'~/.local/bin/',
	'~/bin/',
    ];

    this.initPromise = this.getBinaryFromIPFS(bin);

    return this.initPromise
}

function unifyArch() {
	return platformMap [process.platform + '_' +  process.arch];
}

function IPFSGetBinaryPathForArch (bin) {
	return [IPFSRoot, unifyArch(), bin].join('/');
}

ADH.prototype.findInCommonPath = function (binary){
    var self = this;
    return new Promise (function (accept, reject) {
	var fs = require('fs'),
	    path = require('path');

	var promises = self.commonPath.map(function (p) {
	    var f = expand(path.join (p, binary))
	    console.log ('looking for', binary, '@', f)
	    return new Promise (function (accept, reject) {
		fs.access(f, fs.X_OK, function (err) {
		    console.log(f, err ? 'no access!' : 'looks good');
		    // HACK:xaiki, the native promise's all only
		    // supports agregating accepts, so here we
		    // allways accept and will look at the value
		    // later (in the all function).
		    return err ? accept (false) : accept (f);
		})
	    })
	})

	Promise.all(promises)
	    .catch (function (e, v) {
		/* error */
		return reject (e);
	    }).then(function (res){
		/* no error,
		   false: not found,
		   url: found something executable
		*/
		var bins = _.filter(res, function (v) {
		    return v;
		})

		console.log (bins)
		bins.length ? accept (bins) : reject (false)
	    });
    })
}

ADH.prototype.runAndMonitor = function (bin, args) {
	var CP = require('child_process')

	var h = CP.spawn(bin, args);
	['stdout', 'stderr'].map (function (channel) {
		h[channel].on('data', function (data) {
			console.log (channel, data.toString())
		})
	})

	h.on ('error', function (err) {
		console.error ('error', err)
	})

	h.on ('exit', function (code, signal) {
		console.error ('exit', code, signal)
	})

	h.on ('close', function (code, signal) {
		console.error ('close', code, signal)
	})

	h.on ('disconnect', function () {
		console.error ('disconnect')
	})

	h.on ('message', function () {
		console.error ('message')
	})

	return h;
}

ADH.prototype.FindAndStart = function (bin, args) {
    var self = this;
    return this.findInCommonPath (bin)
	.then(function (bins)  {
	    var bin;
	    while (bins.length) {
		bin = bins.pop()
		try {
		    return self.runAndMonitor(bin, args);
		} catch (e) {
		    console.log ('error starting', bin, args, e);
		}
	    }
	    return bin;
	})
}

ADH.prototype.getBinaryFromIPFS = function (bin) {
    var fs = require ('fs');

    return this.getFromIPFS(IPFSGetBinaryPathForArch(bin),
		       expand (path.join ("~/bin/", bin)))
	.then(function (path) {
	    console.log ('+x got from IPFS at', path)
	    fs.chmodSync (path, 0770)
	    return path;
	})
	.catch(function (err) {
	    console.error ('error getting from IPFS', err)
	})
}

ADH.prototype.getFromIPFS = function(hash, dest) {
    var self = this;
    return this.getIPFShost()
	.then(function (host) {
	    return self.getFromIPFSHost (host, hash, dest)
	})
}

function requestPromise (confObj) {
	var request = require ('request');

	return new Promise (function (accept, reject) {
		request (confObj, function (err, res, data) {
			if (err)
				return reject (err)
			return accept (data)
		})
	})
}

ADH.prototype.getIPFShost = function() {
    var api  = 'http://localhost:5001/api/v0/version',
        host = 'http://localhost:8080/ipfs';

    return requestPromise({url: api, json: true})
	.then(function (data) {
	    console.log ('got IPFS runing, do nothing', data);
	    return host;
	})
	.catch (function () {
	    return Promise.resolve (FindAndStart ('ipfs', ['daemon']))
		.then(function () {
		    return api;
		})
	})
	    .catch (function () {
		console.log ('no local ipfs binary found,',
			     'using the web gateway.');
		return 'http://ipfs.alexandria.media/ipfs'
	    });
}

ADH.prototype.getFromIPFSHost = function (host, path, dest) {
    var progress = require ('request-progress'),
	request  = require ('request'),
	fs       = require ('fs');

    return new Promise( function (accept, reject) {
	var ws = fs.createWriteStream(dest);
	progress(request(host + '/' + path))
	    .on('progress', function (state) {
		console.log('received size in bytes', state.received);
		console.log('total size in bytes', state.total);
		console.log('percent', state.percent);
	    })
	    .on('error', function (err) {
		console.log ('error', err)
		reject (err);
	    })

	    .pipe(ws)
	    .on('error', function (err) {
		console.log ('error', err)
		reject (err);
	    })
	    .on('close', function (err) {
		console.log ('close', dest)

		ws.on('finish', function (err) {
		    console.log ('done', dest)
		    accept(dest)
		})
	    })
    })
}
