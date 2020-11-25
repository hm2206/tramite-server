'use strict'

const Tramite = use('App/Models/Tramite');
const Helpers = use('Helpers');
const { validateAll } = use('Validator');
const { Storage, validation } = require('validator-error-adonis');
const Event = use('Event');

class VerifyController {

    handle = async ({ params, request }) => {
        // validar
        await validation(validateAll, request.all(), {
            verify_observation: 'required|max:255'
        });
        // obtener el auth
        let auth = request.$auth;
        // obtener tramite
        let tramite = await Tramite.query() 
            .where('verify', 0)
            .where('person_id', auth.person_id)
            .where('id', params.id)
            .first();
        // validar
        if (!tramite) throw new Error("No se encontró el tramite");
        // guardar archivos
        if (request.file('files')) {
            let files = await Storage.saveFile(request, "files", {
                extnames: ['pdf'],
                required: false,
                multifiles: true
            }, Helpers, {
                path: `/tramite/${tramite.slug}`,
                options: {
                    overwrite: true 
                }
            });
            // validar archivos
            if (!files.success) throw new Error("No se pudo guardar todos los archivos");
        }
        // actualizar
        tramite.verify = 1;
        tramite.verify_observation = request.input('verify_observation');
        // verificar el trámite
        await tramite.save();
        // enviar tramite
        await Event.fire("tramite::verify", request, tramite);
        // response
        return { 
            success: true,
            status: 201,
            message: "Los datos se verificarón correctamente!"
        };
    }

}

module.exports = VerifyController
