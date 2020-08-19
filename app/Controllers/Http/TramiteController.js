'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK } = require('../../../utils')

class TramiteController {

    index = async ({ request }) => {
        let { page, query_search } = request.all();
        let tramite = Tramite.query();
    }

    store = async ({ request }) => {
        await validation(validate, request.all(), {
            person_id: "required",
            document_number: 'required|min:4|max:255',
            tramite_type_id: 'required|max:11',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4',
            dependencia_origen_id: 'required'
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
            person_id: request.input('person_id'),
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            file: request.input('file', '/file'),
            dependencia_origen_id: request.input('dependencia_origen_id')
        }
        // guardar file
        let file = await Storage.saveFile(request, 'file', {
            required: true,
            size: '5mb',
            extnames: ['pdf', 'docx']
        }, Helpers, {
            path: '/tramite/file',
            options: {
                name: `tramite_${slug}`,
                overwrite: true 
            }
        })
        // add file 
        payload.file = LINK('tmp', file.path)
        // guardar tramite
        let tramite = await Tramite.create(payload)
        // obtener url
        await tramite.getUrlFile();
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
