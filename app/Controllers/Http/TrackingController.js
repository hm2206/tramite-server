'use strict'

const Tracking = use('App/Models/Tracking');
const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const uid = require('uid');
const Helpers = use('Helpers');
const { LINK } = require('../../../utils');
const Collect = require('collect.js');

class TrackingController {

    /**
     * obtener el tracking de la dependencia correspondiente
     * @param {*} param0 
     */
    index = async ({ request }) => {
        let tracking = await this._getTramiteTracking({ request });
        return await this._configTrackings({ request, tracking });
    }

    /**
     * obtener la bandeja de entrada del usuario
     * @param {*} param0 
     */
    my_tray = async ({ request }) => {
        let auth = request.$auth;
        let tracking = await this._getTramiteTracking({ request, user_id: auth.id });
        return this._configTrackings({ request, tracking });
    }

    /**
     * obtener el tracking del tramite
     * @param {*} param0 
     */
    _getTramiteTracking = async ({ request, user_id }) => {
        let { page, status } = request.all();
        // get tracking
        let tracking = Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .join('tramite_types as type', 'type.id', 'tra.tramite_type_id')
            .where('tra.entity_id', request._entity.id)
            .where('dependencia_destino_id', request._dependencia.id)
        // filtros
        if (status) tracking.where('status', status);
        if (user_id) tracking.where('trackings.user_destino_id', user_id)
        else tracking.whereNull('trackings.user_destino_id');
        // get paginate
        tracking = await tracking.select(
                'trackings.id', 'tra.slug', 'tra.document_number', 
                'type.description', 'tra.person_id', 'tra.dependencia_origen_id',
                'trackings.status', 'trackings.parent', 'tra.created_at',
                'trackings.dependencia_destino_id', 'tra.entity_id'
            ).paginate(page || 1, 20);
        // to JSON
        return await tracking.toJSON();
    }   

    /**
     * Configuracion de los trackings
     * @param {*} tracking 
     */
    _configTrackings = async ({ request, tracking }) => {
        // get dependencias origen
        let dependenciaIds = Collect(tracking.data).pluck('dependencia_origen_id').all().join('&ids[]=');
        let origen = await request.api_authentication.get(`dependencia?ids[]=${dependenciaIds}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: { }
            }));
        // collect origen
        origen = Collect(origen.dependencia.data || []);
        // get person
        let personIds = Collect(tracking.data).pluck('person_id').all().join('&ids[]=');
        let person = await request.api_authentication.get(`find_people?id[]=${personIds}`)
            .then(res => res.data)
            .catch(err => ([]));
        // collect person
        person = Collect(person || []);
        // add meta datos to tracking
        tracking.data.map(tra => {
            tra.dependencia_origen = origen.where('id', tra.dependencia_origen_id).first() || {};
            tra.person = person.where('id', tra.person_id).first() || {};
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

    /**
     * Derivar, Anular, Aceptar, Rechazar y Finalizar el tramite en el tracking
     * @param {*} param0 
     */
    next = async ({ params, request }) => {
        // variable globales
        let tracking = null;
        let file_tmp = await this._saveFile({ request });
        let file = null;
        let description = null;
        let current = 0;
        let status = `${request.input('status')}`.toUpperCase();
        // status permitidos
        let allow_verification = ['DERIVADO', 'FINALIZADO', 'ANULADO', 'RESPONDER'];
        let allow_validation = ['ACEPTADO', 'RECHAZADO'];
        // generar payload
        let payload = { 
            description: '---',
            file: null,
            user_id: request.$auth.id,
            user_destino_id: request.input('user_destino_id', null),
            tramite_id: "",
            dependencia_origen_id: request._dependencia.id,
            dependencia_destino_id: request.input('dependencia_destino_id'),
            current: 1,
            parent: 0
        }
        // validar status
        if (allow_verification.includes(status)) {
            // validar inputs
            await validation(validate, request.all(), {
                status: 'required',
                description: 'required|max:255'
            });
            // obtener tracking parent
            tracking = await this._getTracking({ params, request }, ['PENDIENTE', 'REGISTRADO'], 1);
            payload.tramite_id = tracking.tramite_id;
            payload.file = file_tmp;
            // derivar tracking
            if (status == 'DERIVADO') await this._derivar({ request, payload });
            else if(status == 'RESPONDER') {
                // get response 
                let respuesta = await this._getResponse(tracking)
                console.log(respuesta);
                payload.status = 'ENVIADO';
                payload.description = '---';
                payload.dependencia_destino_id = tracking.dependencia_origen_id;
                payload.user_destino_id = respuesta.user_destino_id;
                this._nextTracking({ payload });
                status = 'RESPONDIDO';
                description = request.input('description')
            } else {
                // add file y description
                file = file_tmp;
                description = request.input('description');
                current = 1;
            }
        } else if ( allow_validation.includes(status)) {
            // validar inputs
            await validation(validate, request.all(), {
                status: 'required',
                description: 'required|max:255'
            });
            // obtener tracking sin parent
            tracking = await this._getTracking({ params, request }, ['ENVIADO', 'REGISTRADO'], 0);
            if (tracking)
                payload.user_destino_id = tracking.user_destino_id || null; 
                payload.tramite_id = tracking.tramite_id;
                payload.dependencia_origen_id = tracking.dependencia_origen_id;
                payload.dependencia_destino_id = request._dependencia.id;
                payload.user_id = request.$auth.id;
                payload.parent = 1;
            // aceptar tracking
            if (status == 'ACEPTADO') await this._nextTracking({ payload });
            else {
                // add file y description
                file = file_tmp;
                description = request.input('description');
                current = 1;
            }
        } else throw new Error(`El status no está permitido (${allow_verification.join(", ")}, ${allow_validation.join(", ")})`);
        // actualizar status del tracking actual
        tracking.file = file;
        tracking.user_id = request.$auth.id;
        tracking.current = current;
        tracking.description = description || tracking.description;
        tracking.status = status;
        await tracking.save();
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_TRACKING_NEXT',
            message: `El trámite se a ${status.toLowerCase()} correctamente`
        }
    }

    /**
     * obtener meta datos del remitente que derivo el tramite
     * @param {*} param0 
     */
    _getResponse = async (tracking) => {
        let response = await Tracking.query()
            .where('status', 'DERIVADO')
            .where('tramite_id', tracking.tramite_id)
            .where('parent', 1)
            .orderBy('id', 'DESC')
            .first();
        // validar response
        if (!response) throw new Error(`No se pudó responder a la dependencia`);
        // response 
        return response;
    }

    /**
     * Obtener el tracking del tramite
     * @param {*} param0 
     * @param {*} parent 
     */
    _getTracking = async ({ params, request }, status = ["PENDIENTE"], parent = 1) => {
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', request._entity.id)
            .where('trackings.dependencia_destino_id', request._dependencia.id)
            .whereIn('trackings.status', status)
            .where('trackings.id', params.id)
            .where('trackings.current', 1)
            .where('trackings.parent', parent)
            .select('trackings.*')
            .first();
        // validar tracking
        if (!tracking) throw new Error('No se encontró el tracking del tramite')
        // response tracking
        return tracking;
    }

    /**
     * guardar file
     * @param {*} param0 
     */
    _saveFile = async ({ request }) => {
        // guardar archivo 
        let file = await Storage.saveFile(request, 'file', {
            size: '5mb',
            extnames: ['pdf', 'docx']
        }, Helpers, {
            path: '/tracking/file',
            options: {
                name: `tracking_${uid(8)}`,
                overwrite: true 
            }
        });
        // response path file
        return file.path ? LINK('tmp', file.path) : null;
    }

    /**
     * generar nuevo tracking
     * @param {*} param0 
     */
    _nextTracking = async ({ payload }) => {
        // save tracking
        await Tracking.create(payload);
    }

    /**
     * derivar tracking
     * @param {*} param0 
     */
    _derivar = async ({ request, payload }) => {
        // validar input dependencia
        await validation(validate, request.all(), {
            dependencia_destino_id: 'required'
        })
        // validar dependencia interna
        if (request.input('dependencia_destino_id') == request._dependencia.id) {
            if (!request.input('user_destino_id')) throw new ValidatorError([{ field: 'user_destino_id', message: 'El destinatario es obligatorio' }]);
            if (request.input('user_destino_id') == request.$auth.id) throw new ValidatorError([{ field: 'user_destino_id', message: 'Usted no puede se el destinatario' }]);
        }
        // change status
        payload.status = 'ENVIADO';
        // save next tracking
        await this._nextTracking({ payload });
    }

}

module.exports = TrackingController
