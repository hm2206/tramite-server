'use strict'

const Tracking = use('App/Models/Tracking');
const Helpers = use('Helpers');
const { validateAll } = use('Validator');
const { Storage, validation } = require('validator-error-adonis');
const Event = use('Event');

class NextController {

    handle = async ({ params, request }) => {
        // obtener el auth
        let auth = request.$auth;
        // obtener tramite
        let tracking = await Tracking.query()
            .with('tramite') 
            .where('id', params.id)
            .where('user_verify_id', auth.id)
            .first();
        // validar
        if (!tracking) throw new Error("No se encontró el seguimiento del trámite");
        // actualizar
        tracking.next = 1;
        tracking.user_verify_id = auth.id;
        await tracking.save();
        // enviar tramite
        await Event.fire("tramite::verify", request, tracking.tramite);
        // response
        return { 
            success: true,
            status: 201,
            message: "El tramite fué revisado"
        };
    }

}

module.exports = NextController;
