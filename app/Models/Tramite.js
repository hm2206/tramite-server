'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Env = use('Env');
const Model = use('Model');
const codeQR = require('qrcode');

class Tramite extends Model {

    static boot() {
        super.boot();
        this.addHook('afterDelete', 'TramiteHook.deleteChildren');
    }

    static get computed () {
        return ['link'];
    }

    getLink = () => {
        return `${Env.get('CLIENT_TRAMITE')}?slug=${this.slug}`;
    }
    
    // functiones
    funcCodeQr = async () => {
        let link = `${Env.get('CLIENT_TRAMITE')}?slug=${this.slug}`;
        let code_qr  = await codeQR.toDataURL(link);
        return code_qr;
    }

    // relaciones
    tramite_type = () => {
        return this.belongsTo('App/Models/TramiteType');
    }

    tracking = () => {
        return this.hasMany('App/Models/Tracking');
    }

    current_tracking () {
        return this.hasOne('App/Models/Tracking')
    }

    files() {
        return this.hasMany('App/Models/File', 'id', 'object_id');
    }
}

module.exports = Tramite
