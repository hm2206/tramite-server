'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const moment = require('moment');

class Tracking extends Model {

    static get hidden () {
        return ['visible', 'description'];
    }

    static get computed () {
        return ['day']
    }

    static boot() {
        super.boot();
        this.addHook('beforeSave', 'TrackingHook.formatter');
        this.addHook('afterCreate', 'TrackingHook.createVerify');
        this.addHook('afterDelete', 'TrackingHook.deleteVerify');
    }

    // computed
    getDay = (obj) => {
        let current = moment(moment().format('YYYY-MM-DD'));
        let comparar = moment(moment(obj.created_at || current).format('YYYY-MM-DD'));
        return current.diff(comparar, 'days');
    }

    // relaciones
    tramite = () => {
        return this.belongsTo('App/Models/Tramite');
    }

    verify = () => {
        return this.hasOne('App/Models/Verify', 'user_verify_id', 'user_id')
    }

    tracking = () => {
        return this.belongsTo('App/Models/Tracking', 'tracking_id', 'id');
    }

    tracking_send = () => {
        return this.hasOne('App/Models/Tracking', 'id', 'tracking_id');
    }

    info = () => {
        return this.belongsTo('App/Models/Info');
    }

    multiples () {
        return this.hasMany('App/Models/Tracking', 'id', 'multiple_id');
    }
}

module.exports = Tracking
