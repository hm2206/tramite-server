'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const { URL } = require('../../utils');

class Tramite extends Model {

    static boot() {
        super.boot();
        this.addHook('afterCreate', 'TramiteHook.createTracking');
    }

    getUrlFile = (up = false) => {
        this.file = URL(this.file, up);
    }

    getUrlFiles = async (up = false) => {
        this.files = JSON.parse(this.files || []);
        let newFiles = [];
        await this.files.filter(f => newFiles.push(URL(f, up)));
        this.files = newFiles;
    }

}

module.exports = Tramite
