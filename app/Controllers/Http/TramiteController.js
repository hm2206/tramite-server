'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK } = require('../../../utils')
const Event = use('Event');

class TramiteController {

    store = async ({ request }) => {
        await validation(validate, request.all(), {
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4',
        });
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // payload
        let payload = {
            user_id: request.$auth.id,
            entity_id: request._entity.id,
            dependencia_id: request._dependencia.id,
            person_id: request.$auth.person_id,
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            dependencia_origen_id: request._dependencia.id
        }
        // guardar file
        let file = await Storage.saveFile(request, 'files', {
            multifiles: true,
            required: true,
            size: '5mb',
            extnames: ['pdf', 'docx']
        }, Helpers, {
            path: '/tramite/file',
            options: {
                overwrite: true 
            }
        })
        // add files
        let tmpFile = [];
        await file.files.map(f => tmpFile.push(LINK('tmp', f.path)));
        // add file 
        payload.files = JSON.stringify(tmpFile);
        // guardar tramite
        let tramite = await Tramite.create(payload)
        // obtener url
        await tramite.getUrlFile();
        // get person 
        let person = request.$auth.person;
        // send event
        Event.fire('tramite::new', request, tramite, person.email_contact, request._dependencia);
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_SUCCESS',
            message: 'El tramite se creó correctamente',
            tramite
        }
    }

}

module.exports = TramiteController
