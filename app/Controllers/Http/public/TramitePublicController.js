'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const DependenciaExterior = use('App/Models/DependenciaExterior');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK, URL } = require('../../../../utils')
const collect = require('collect.js');

class TramitePublicController {

    /**
     * guardar tramite desde el exterior
     * @param {*} param0 
     */
    store = async ({ request }) => {
        await validation(validate, request.all(), {
            entity_id: 'required',
            dependencia_id: 'required',
            person_id: "required",
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4'
        });
        // obtener entity
        let entity = await request.api_authentication.get(`entity/${request.input('entity_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                entity: {}
            }));
        // validar entity
        if (!entity.id) throw new ValidatorError([{ field: 'entity_id', message: 'No se encontró la entidad' }]);
        // obtener dependencia
        let dependencia = await request.api_authentication.get(`dependencia/${request.input('dependencia_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // validar dependencia
        if (!dependencia.success) throw new ValidatorError([{ field: 'dependencia_id', message: dependencia.message }]);
        if (!await DependenciaExterior.query().whereRaw(`entity_id = ${request.input('entity_id')} AND dependencia_id = ${request.input('dependencia_id')}`).getCount()) 
            throw new ValidatorError([{ field: 'dependencia_id', message: 'La dependencia no está permitida' }]);
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${request.input('person_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: err.message,
                message: err.message,
                person: {}
            }))
        // validar persona
        if (!person.id) throw new ValidatorError([{ field: 'person_id', message: 'No se encontró la persona' }])
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // payload
        let payload = {
            entity_id: entity.id,
            dependencia_id: dependencia.dependencia.id,
            person_id: person.id,
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            file: request.input('file', '/file')
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
        let tramite = await Tramite.create(payload);
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

    /**
     * mostrar tramite por slug
     * @param {*} param0 
     */
    show = async ({ params, request }) => {
        let tramite = await Tramite.findBy('slug', params.slug);
        if (!tramite) throw new Error('No se encontró el tramite');
        // obtener entity
        let entity = await request.api_authentication.get(`entity/${tramite.entity_id}`)
            .then(res => res.data)
            .catch(err => ({}));
        // add entity
        tramite.entity = entity;
        // obtener dependencia
        let { dependencia } = await request.api_authentication.get(`dependencia/${tramite.dependencia_id}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // add dependencia
        tramite.dependencia = dependencia || {};
        // obtener dependencia origen
        let origen = await request.api_authentication.get(`dependencia/${tramite.dependencia_origen_id}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // add dependencia
        tramite.dependencia_origen = origen.dependencia || {};
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${tramite.person_id}`)
            .then(res => res.data)
            .catch(err => ({}));
        // add persona 
        tramite.person = person || {};
        // generar url file
        tramite.getUrlFile();
        // response
        return { 
            success: true,
            status: 201,
            code: 'RES_TRAMITE',
            tramite
        }
    }

    /**
     * mostrar el historial del tramite
     * @param {*} param0 
     */
    tracking = async ({ params, request }) => {
        let { page } = request;
        // get tracking
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.slug', params.slug)
            .whereIn('trackings.status', ['ACEPTADO', 'DERIVADO', 'RECHAZADO', 'FINALIZADO'])
            .select('trackings.*')
            .paginate(page || 1, 20);
        // parse json 
        tracking = await tracking.toJSON();
        // obtener dependencia destino
        let idDestinos = collect(tracking.data).pluck('dependencia_destino_id').all().join('&ids[]='); 
        let destino = await request.api_authentication.get(`dependencia?ids[]=${idDestinos}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: { }
            }));
        // collect dependencia
        destino = collect(destino.dependencia.data || []);
        // add dependencia destino
        tracking.data.map(tra => {
            tra.dependencia_destino = destino.where('id', tra.dependencia_destino_id).first() || {};
            tra.file = tra.file ? URL(tra.file) : null;
            return tra;
        });
        // response
        return { 
            success: true,
            status: 201,
            code: 'RES_TRACKING',
            tracking
        }
    }

}

module.exports = TramitePublicController
