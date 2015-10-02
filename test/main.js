var assert = require("assert");
var ADH = require("../index.js");

describe('Handler', function () {
    describe('be thenable', function () {
        it('should return a thenable object', function () {
            var ipfs = new ADH ('ipfs');
            assert.notEqual (ipfs.then, undefined);
        })
    })
})
