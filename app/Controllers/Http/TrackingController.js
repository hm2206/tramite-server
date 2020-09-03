'use strict'

const Tracking = use('App/Models/Tracking');
const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const uid = require('uid');
const Helpers = use('Helpers');
const { LINK, URL } = require('../../../utils');
const Collect = require('collect.js');
const { raw } = require('mysql');

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
        let { page, status, query_search } = request.all();
        // get tracking
        let tracking = Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .join('tramite_types as type', 'type.id', 'tra.tramite_type_id')
            .where('tra.entity_id', request._entity.id)
            .where('trackings.dependencia_id', request._dependencia.id)
        // filtros
        if (status) tracking.where('status', status);
        if (query_search) tracking.where('tra.slug', 'like', `%${query_search}%`);
        if (user_id) tracking.where('trackings.user_destino_id', user_id);
        else tracking.whereNull('trackings.user_destino_id');
        // get paginate
        tracking = await tracking.select(
                'trackings.id', 'tra.slug', 'tra.document_number', 
                'type.description', 'tra.person_id', 'tra.dependencia_origen_id',
                'trackings.dependencia_id', 'trackings.status', 'trackings.parent', 'tra.created_at',
                'trackings.dependencia_destino_id', 'tra.entity_id', 'tra.asunto', 'tra.files as tramite_files', 
                'trackings.files', 'type.description as tramite_type'
            ).paginate(page || 1, 20);
        // to JSON
        tracking = await tracking.toJSON();
        // recovery files
        await tracking.data.map(async tra => {
            // add files 
            let newFiles = [];
            tra.files = await JSON.parse(tra.files) || [];
            tra.files = await tra.files.filter(f => newFiles.push(URL(f)));
            tra.files = newFiles;
            // add tramite files
            let newTramiteFiles = [];
            tra.tramite_files = await JSON.parse(tra.tramite_files) || [];
            tra.tramite_files = await tra.tramite_files.filter(f => newTramiteFiles.push(URL(f)));
            tra.tramite_files = newTramiteFiles;
            // response tracking
            return tra;
        });
        // response 
        return tracking;
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
            tra.dependencia_origen = origen.where('id', tra.dependencia_origen_id).first() || { nombre: 'Exterior' };
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
        let copy = JSON.parse(request.input('copy')) || [];
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
            description: request.input('description'),
            files: JSON.stringify([]),
            user_id: request.$auth.id,
            user_destino_id: request.input('user_destino_id', null),
            tramite_id: "",
            dependencia_id: request.input('dependencia_destino_id'),
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
            payload.files = file_tmp;
            // derivar tracking
            if (status == 'DERIVADO') {
                tracking.dependencia_destino_id = request.input('dependencia_destino_id');
                description = request.input('description');
                file = file_tmp;
                await this._derivar({ request, payload });
                // generar copia
                await this._copies({ 
                    request, 
                    payload: copy, 
                    dependencia_origen_id: payload.dependencia_origen_id, 
                    dependencia_destino_id: payload.dependencia_destino_id,
                    tramite_id: tracking.tramite_id
                });
            }
            else if(status == 'RESPONDER') {
                // get response 
                let respuesta = await this._getResponse(tracking)
                payload.status = 'ENVIADO';
                payload.description = '---';
                payload.dependencia_id = tracking.dependencia_origen_id;
                payload.dependencia_origen_id = tracking.dependencia_origen_id;
                payload.dependencia_destino_id = tracking.dependencia_origen_id;
                payload.user_destino_id = respuesta.user_destino_id;
                this._nextTracking({ payload });
                status = 'RESPONDIDO';
                description = request.input('description');
                file = file_tmp;
                tracking.dependencia_destino_id = tracking.dependencia_origen_id;
                // generar copia
                await this._copies({ 
                    request, 
                    payload: copy, 
                    dependencia_origen_id: payload.dependencia_origen_id, 
                    dependencia_destino_id: payload.dependencia_destino_id,
                    tramite_id: tracking.tramite_id
                });
            } else {
                // add file y description
                file = file_tmp;
                description = request.input('description');
                current = 1;
                // generar copia
                await this._copies({ 
                    request, 
                    payload: copy, 
                    dependencia_origen_id: tracking.dependencia_origen_id, 
                    dependencia_destino_id: tracking.dependencia_destino_id,
                    tramite_id: tracking.tramite_id
                });
            }
        } else if (allow_validation.includes(status)) {
            // validar inputs
            await validation(validate, request.all(), {
                status: 'required',
                description: 'required|max:255'
            });
            // obtener tracking sin parent
            tracking = await this._getTracking({ params, request }, ['ENVIADO', 'REGISTRADO'], 0);
            // setting payload
            payload.user_destino_id = tracking.user_destino_id || null; 
            payload.tramite_id = tracking.tramite_id;
            payload.dependencia_id = request._dependencia.id;
            payload.dependencia_origen_id = tracking.dependencia_origen_id;
            payload.dependencia_destino_id = request._dependencia.id;
            payload.user_id = request.$auth.id;
            payload.parent = 1;
            // add file y description
            file = file_tmp;
            description = request.input('description');
            // aceptar tracking
            if (status == 'ACEPTADO') {
                await this._nextTracking({ payload });
                // generar copia
                await this._copies({ 
                    request, 
                    payload: copy, 
                    dependencia_origen_id: payload.dependencia_origen_id, 
                    dependencia_destino_id: payload.dependencia_destino_id,
                    tramite_id: tracking.tramite_id 
                });
            }
            else {
                current = 1;
                // generar copia
                await this._copies({ 
                    request, 
                    payload: copy, 
                    dependencia_origen_id: tracking.dependencia_origen_id, 
                    dependencia_destino_id: tracking.dependencia_destino_id,
                    tramite_id: tracking.tramite_id
                });
            }
        } else throw new Error(`El status no está permitido (${allow_verification.join(", ")}, ${allow_validation.join(", ")})`);
        // actualizar status del tracking actual
        tracking.files = file;
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
        let file = await Storage.saveFile(request, 'files', {
            size: '2mb',
            extnames: ['pdf', 'docx'],
            multifiles: true
        }, Helpers, {
            path: '/tracking/file',
            options: {
                overwrite: true 
            }
        });
        // new files
        let newFiles = [];
        // add files 
        if (file && file.success) {
            file.files.map(f => newFiles.push(LINK('tmp', f.path)));
        }
        // response path file
        return JSON.stringify(newFiles);
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

    /**
     * agregar copia
     * @param {*} param0 
     */
    _copies = async ({ request, payload = [], dependencia_origen_id, dependencia_destino_id, tramite_id }) => {
        let newPayload = [];
        // add ids
        await payload.map((p, index) => {
            // add _id
            p._id = index + 1;
            // response
            return p;
        });
        // add collect
        let datos = Collect(payload);
        let ids = [];
        // filtrar duplicados
        await datos.map(async d => {
            let raw_query = await datos.where('dependencia_id', d.dependencia_id).where('user_id', d.user_id).where('_id', '!=', d._id);
            let count = raw_query.count();
            let pluck = raw_query.pluck('_id').all();
            // validar count 
            if (count > 1) {
                if (ids.indexOf(d._id) == -1) {
                    ids = [...ids, ...pluck];
                    newPayload.push(this._formatPayloadCopy({ request, copy: d, dependencia_origen_id, dependencia_destino_id, tramite_id }));
                } 
            } else {
                newPayload.push(this._formatPayloadCopy({ request, copy: d, dependencia_origen_id, dependencia_destino_id, tramite_id }));
            }
            // response 
            return d;
        });
        // insert copy
        let newCopy = await Tracking.createMany(newPayload);
        // response
        return  newCopy;
    }

    /**
     * Formato para prepare query copy
     * @param {*} param0 
     */
    _formatPayloadCopy = ({ request, copy, dependencia_origen_id, dependencia_destino_id, tramite_id }) => {
        return {
            tramite_id,
            dependencia_id: copy.dependencia_id,
            dependencia_origen_id,
            dependencia_destino_id,
            user_id: request.$auth.id,
            user_destino_id: copy.user_id,
            description: null,
            files: null,
            parent: 0,
            current: 0,
            status: 'COPIA'
        }
    }
}

module.exports = TrackingController
