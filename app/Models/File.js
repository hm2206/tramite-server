'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model');
const { URL } = require('../../utils');
const roundTo = require('round-to');

class File extends Model {

    static get computed () {
        return ['size_kb'];
    }

    getUrl = (value) => {
        return URL(value);
    }

    getSizeKb = (obj) => {
        return  `${roundTo.down(obj.size / 1024, 2)}kb`;
    } 
}

module.exports = File
