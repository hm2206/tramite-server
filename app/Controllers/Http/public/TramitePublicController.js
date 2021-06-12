'use strict'

const { validation, ValidatorError } = require('validator-error-adonis');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const DependenciaExterior = use('App/Models/DependenciaExterior');
const { URL } = require('../../../../utils')
const collect = require('collect.js');
const Event = use('Event');
const codeQR = require('qrcode');
const Env = use('Env');
const TramiteEntity = require('../../../Entities/TramiteEntity');
const uid = require('uid');

class TramitePublicController {

    /**
     * guardar tramite desde el exterior
     * @param {*} param0 
     */
    store = async ({ request }) => {
        const authentication = request.api_authentication;
        let datos = request.all();
        await validation(null, datos, {
            entity_id: 'required',
            dependencia_id: 'required'
        });
        // obtener entity
        let { entity } = await authentication.get(`entity/${request.input('entity_id')}`)
            .then(res => res.data)
            .catch(err => ({ success: false, entity: {} }));
        // validar entity
        if (!entity.id) throw new ValidatorError([{ field: 'entity_id', message: 'No se encontró la entidad' }]);
        // obtener dependencia
        let { dependencia } = await authentication.get(`dependencia/${request.input('dependencia_id')}`)
            .then(res => res.data)
            .catch(err => ({ success: false, dependencia: {} }));
        // validar dependencia
        if (!dependencia.id) throw new ValidatorError([{ field: 'dependencia_id', message: "No se encontró la dependencia" }]);
        // validar dependencia permitida
        let is_allow = await DependenciaExterior.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', dependencia.id)
            .getCount();
        if (!is_allow) throw new ValidatorError([{ field: 'dependencia_id', message: 'La dependencia no está permitida' }]);
        // processar trámite
        datos.slug = uid(10);
        const tramiteEntity = new TramiteEntity(authentication);
        const tramite = await tramiteEntity.store(request, datos, {}, null);
        // enviar evento
        Event.fire('tramite::new', request, tramite, tramite.person, tramite.person, dependencia);
        // response
        return {
            success: true,
            status: 201,
            message: "El trámite se guardó correctamente!",
            tramite
        }
    }

    /**
     * mostrar tramite por slug
     * @param {*} param0 
     */
    show = async ({ params, request }) => {
        let tramite = await Tramite.query()
            .with('tramite_type')
            .where('slug', params.slug)
            .first();
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
        tramite.dependencia = dependencia || { nombre: 'Exterior' };
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
        await tramite.getUrlFiles();
        // generar code qr
        let link = `${Env.get('CLIENT_TRAMITE')}?slug=${tramite.slug}`;
        let code = await codeQR.toDataURL(link);
        tramite.code_qr = code;
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
            .whereIn('trackings.status', ['ACEPTADO', 'DERIVADO', 'RESPONDIDO', 'RECHAZADO', 'FINALIZADO','ANULADO'])
            .select('trackings.*')
            .paginate(page || 1, 20);
        // parse json 
        tracking = await tracking.toJSON();
        // obtener dependencia destino
        let idDestinos = await collect(tracking.data).pluck('dependencia_destino_id').all().join('&ids[]='); 
        let destino = await request.api_authentication.get(`dependencia?ids[]=${idDestinos}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: { }
            }));
        // collect dependencia
        destino = collect(destino.dependencia.data || []);
        // obtener users person
        let userIds = collect(tracking.data).pluck('user_id').all().join('&ids[]=');
        let user = await request.api_authentication.get(`user?ids[]=${userIds}`) 
            .then(res => res.data)
            .catch(err => ({ data: [] }));
        // collect user
        user = collect(user.data || []);
        // add dependencia destino y user
        tracking.data.map(async tra => {
            tra.dependencia_destino = destino.where('id', tra.dependencia_destino_id).first() || {};
            tra.user = user.where('id', tra.user_id).first() || {};
            tra.files = await JSON.parse(tra.files) || [];
            let newFiles = [];
            await tra.files.filter(f => newFiles.push(URL(f)));
            tra.files = newFiles;
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
