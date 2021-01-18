'use strict'

const Tracking = use('App/Models/Tracking');
const Verify = use('App/Models/Verify');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const moment = require('moment');
const Event = use('Event');


class VerifyController {

    handle = async ({ params, request }) => {
        let auth = request.$auth;
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let tracking = await Tracking.query()
            .with('tramite')
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('trackings.id', params.id)
            .where('trackings.revisado', 0)
            .where('trackings.dependencia_id', dependencia.id)
            .where('tra.entity_id', entity.id)
            .select('trackings.*')
            .first();
        // verificar tracking
        if (!tracking) throw new NotFoundModelException("El seguímiento");
        let verify = await Verify.query()
            .where('tracking_id', tracking.id)
            .where('user_id', tracking.user_verify_id)
            .where('user_id', auth.id)
            .first();
        if (!verify) throw new NotFoundModelException("No se puede verificar el seguímiento del trámite");
        // actualizar verify
        await Verify.query()
            .where('id', verify.id)
            .update({ date_verify:  moment().format('YYYY-MM-DD hh:mm:ss') })
        // actualizar tracking
        await Tracking.query()
            .where('id', tracking.id)
            .update({ revisado: 1 });
        // notificar
        await Event.fire("tracking::verify", request, tracking.tramite);
        // response
        return {
            success: true,
            status: 201,
            message: "El seguímiento se verificó correctamente!"
        }
    }

}

module.exports = VerifyController
