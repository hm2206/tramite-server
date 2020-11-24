'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validateAll } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK } = require('../../../utils')
const Event = use('Event');
const codeQR = require('qrcode');
const Env = use('Env');

class TramiteController {

    store = async ({ request }) => {
        await validation(validateAll, request.all(), {
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4',
            person_id: 'required'
        });
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // obtener al auth y dependencia
        let auth = request.$auth;
        let dependencia = request._dependencia;
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${request.input('person_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: err.message,
                message: err.message,
                person: {}
            }))
        // validar persona
        if (!person.id) throw new ValidatorError([{ field: 'person_id', message: 'No se encontró la persona' }]);
        // payload
        let payload = {
            user_id: auth.id,
            entity_id: request._entity.id,
            dependencia_id: dependencia.id,
            person_id: person.id,
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            dependencia_origen_id: request._dependencia.id,
            verify: person.id == auth.person_id ? 1 : 0
        }
        // guardar file
        let file = await Storage.saveFile(request, 'files', {
            multifiles: true,
            required: true,
            size: '5mb',
            extnames: ['pdf']
        }, Helpers, {
            path: `/tramite/${slug}`,
            options: {
                overwrite: true 
            }
        });
        // add files
        let tmpFile = [];
        // validar files y agregar file
        if (file.success) await file.files.map(async f => await tmpFile.push(LINK("tmp", f.path)));
        // add file 
        payload.files = JSON.stringify(tmpFile || []);
        // guardar tramite
        let tramite = await Tramite.create(payload);
        // obtener url
        await tramite.getUrlFile();
        // send event
        Event.fire('tramite::new', request, tramite, person, auth.person, request._dependencia);
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_SUCCESS',
            message: 'El tramite se creó correctamente',
            tramite
        }
    }

    // generar código QR
    codeQr = async ({ params, response }) => {
        try {
            let tramite = await Tramite.find(params.id);
            if (!tramite) throw new Error("No se encontró el tramite");
            let link = `${Env.get('CLIENT_TRAMITE')}?slug=${tramite.slug}`;
            let code = await codeQR.toBuffer(link);
            response.header('Content-Type', 'image/png')
            return response.send(code);
        } catch (error) {
            response.status(error.status || 501);
            return response.send({
                success: false,
                status: error.status || 501,
                message: error.message
            })
        }
    }

}

module.exports = TramiteController
