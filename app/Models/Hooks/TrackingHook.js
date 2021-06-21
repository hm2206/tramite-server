'use strict'

const TrackingHook = exports = module.exports = {}
const Verify = use('App/Models/Verify');
const Role = use('App/Models/Role');
const moment = require('moment');

TrackingHook.formatter = async (tracking) => {
    await delete tracking.day;
}

TrackingHook.createVerify = async (tracking) => {
    // verificar revisado
    let allows = ['REGISTRADO', 'PENDIENTE', 'SUBTRAMITE'];
    if (allows.includes(tracking.status)) {
        let revisado = tracking.revisado;
        if (!revisado) tracking.user_id == tracking.user_verify_id ? 1 : 0;
        // crear usuario que realiza la revisión del tracking
        await Verify.create({
            tracking_id: tracking.id,
            user_id: tracking.user_verify_id,
            date_verify: revisado ? moment().format('YYYY-MM-DD hh:mm:ss') : null
        });
        // actualizar revisión
        tracking.revisado = revisado;
        await tracking.save();
    }
}

TrackingHook.deleteVerify = async (tracking) => {
    await Verify.query()
        .where('tracking_id', tracking.id)
        .delete();
}