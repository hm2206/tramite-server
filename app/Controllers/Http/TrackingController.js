'use strict'

const Tracking = use('App/Models/Tracking');
const Tramite = use('App/Models/Tramite');
const Config = use('App/Models/Config');
const Role = use('App/Models/Role');
const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate, validateAll } = use('Validator');
const uid = require('uid');
const Helpers = use('Helpers');
const { LINK, URL } = require('../../../utils');
const Collect = require('collect.js');
const moment = require('moment');
const { error } = require('pdf-lib');
const DB = use('Database');
const Event = use('Event');

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
        let auth = await request.$auth;
        let tracking = await this._getTramiteTracking({ request, user_id: auth.id, person_id: auth.person_id });
        return this._configTrackings({ request, tracking });
    }

    /**
     * obtener el tracking del tramite
     * @param {*} param0 
     */
    _getTramiteTracking = async ({ request, user_id, person_id }) => {
        let { page, status, query_search } = request.all();
        let status_asc = ['PENDIENTE', 'REGISTRADO', 'ENVIADO'];
        // get tracking
        let tracking = Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .join('tramite_types as type', 'type.id', 'tra.tramite_type_id')
            .where('tra.entity_id', request._entity.id)
            .where('trackings.dependencia_id', request._dependencia.id)
        // filtros
        if (status) tracking.where('status', status);
        if (query_search) tracking.where('tra.slug', 'like', `%${query_search}%`);
        if (user_id) tracking.whereRaw(`(trackings.user_destino_id = ${user_id} OR trackings.user_verify_id = ${user_id})`);
        else tracking.whereNull('trackings.user_destino_id');
        // get paginate
        tracking = await tracking.select(
                'trackings.id', 'tra.slug', 'tra.document_number', 'type.description', 
                'tra.person_id', 'trackings.dependencia_origen_id', 'trackings.dependencia_id', 
                'trackings.status', 'trackings.parent', 'tra.created_at',
                'trackings.dependencia_destino_id', 'tra.entity_id', 'tra.asunto', 
                'tra.files as tramite_files', 'trackings.files', 'type.description as tramite_type',
                'trackings.updated_at', 'tra.verify', 'trackings.tramite_id', 'trackings.alert',
                'trackings.next', 'trackings.user_verify_id'
            ).orderBy('trackings.updated_at', status_asc.includes(status) ? 'ASC' : 'DESC')
            .paginate(page || 1, 20);
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
        await validation(validateAll, request.all(), {
            status: 'required',
            description: 'required|max:255'
        })
        // obtener requets
        let auth = request.$auth;
        let entity = request._entity;
        let dependencia = request._dependencia;
        let status = `${request.input('status')}`.toUpperCase();
        let payload = request.only(['description', 'user_destino_id', 'dependencia_destino_id']);
        // obtener tracking actual
        let current_tracking = await this._getTracking({ params, request }, status);
        let other_dependencia = payload.dependencia_destino_id && dependencia.id != payload.dependencia_destino_id ? true : false;
        let other_user = payload.user_destino_id && auth.id != payload.user_destino_id ? true : false;
        let is_role = await Role.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', dependencia.id)
            .where('user_id', auth.id)
            .first();
        // obtener rol del jefe
        let boss = await Role.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', dependencia.id)
            .where('level', 'BOSS')
            .first();
        // obtener el tramite
        let tramite = await Tramite.find(current_tracking.tramite_id);
        if (!tramite) throw new Error("No se encontró el trámite!");
        // verificar si el user_verify_id es el mismo
        if (!current_tracking.next && current_tracking.user_verify_id != auth.id) throw new Error("Usted no está permitido para realizar la siguiente acción");
        // validar que la dependencia cuante con un rol BOSS
        if (!boss) throw new Error("La Oficina/Dependencia no cuenta con un jefe");
        // serealizar current_tracking
        let datos = Object.assign({}, await current_tracking.toJSON());
        // eliminar id
        delete datos.id;
        // validar acciones
        switch (status) {
            case 'DERIVADO':
                await this._derivado({ tramite, request, current_tracking, other_dependencia, other_user, is_role, boss, auth, payload, datos });
                // deshabilitar
                tramite.verify = 1;
                await tramite.save();
                break;
            case 'ACEPTADO':
            case 'RECHAZADO':
                await this._aceptarOrRechazar({ tramite, request, current_tracking, payload, datos, auth, status, boss });
                tramite.verify = 0;
                await tramite.save();
                break;
            case 'RESPONDER':
                await this._responder({ tramite, request, current_tracking, payload, datos, auth, boss });
                break;
            case 'FINALIZADO':
                await this._finalizar({ tramite, request, current_tracking, payload, auth, boss });
                break;
            case 'ANULADO':
                await this._anulado({ tramite, request, current_tracking, payload, auth, boss })
                break;
            default:
                throw new Error("No se puede realizar la siguiente acción!");
        }
        // response
        return {
            success: true,
            status: 201,
            message: "Listo"
        }
    }

    // derivar tracking
    _derivado = async ({ tramite, request, current_tracking, other_dependencia, other_user, is_role, boss, auth, payload, datos }) => {
        let is_allow = ['PENDIENTE', 'REGISTRADO'];
        // procesar derivado
        if (!is_allow.includes(current_tracking.status)) throw new Error("El trámite no puede ser derivado");
        let enviado = null;
        // generar payload
        datos.description = payload.description;
        datos.user_id = auth.id;
        datos.user_destino_id = null;
        datos.user_verify_id = boss.user_id;
        datos.dependencia_id = payload.dependencia_destino_id;
        datos.dependencia_destino_id = payload.dependencia_destino_id;
        datos.parent = 0;
        datos.next = 1;
        datos.status = 'ENVIADO';
        datos.files = await this._saveFile({ request }, tramite.slug)
        if (other_dependencia) {
            await validation(validateAll, request.all(), {
                dependencia_destino_id: "required"
            });
            // validar si usuario es jefe o esta permitido
            if (!is_role) throw new Error("Usted no está permitido a derivar fuera de su dependencia");
            if (!current_tracking.next && is_role.level != 'BOSS') throw new Error("El trámite aún no fué revisado por su jefe");
            // obtener jefe de la dependencia actual
            let current_boss = await this._getCurrentBoss({ tracking: current_tracking, dependencia_id: payload.dependencia_destino_id });
            datos.user_verify_id = current_boss.user_id;
            datos.dependencia_origen_id = current_tracking.dependencia_id;
            // generar enviado
            enviado = await Tracking.create(datos);
        } else {
            await validation(validateAll, request.all(), {
                user_destino_id: "required"
            });
            // validar usuario sea diferente al actual
            if (!other_user) throw new Error("No puede derivar usted mismo su trámite!");
            datos.user_origen_id = current_tracking.user_destino_id;
            datos.user_destino_id = payload.user_destino_id;
            datos.dependencia_id = current_tracking.dependencia_id;
            datos.dependencia_destino_id = current_tracking.dependencia_id;
            datos.dependencia_origen_id = current_tracking.dependencia_id;
            datos.user_verify_id = request.input('user_destino_id');
            datos.next = 1;
            // generar enviado
            enviado = await Tracking.create(datos);
        }
        // actualizar el pendiente o registrado
        if (enviado) {
            current_tracking.files = datos.files;
            current_tracking.description = enviado.description;
            current_tracking.dependencia_destino_id = enviado.dependencia_id;
            current_tracking.dependencia_origen_id = current_tracking.dependencia_id;
            current_tracking.parent = 0;
            current_tracking.current = 0;
            current_tracking.next = 1;
            current_tracking.status = 'DERIVADO';
            current_tracking.state = 0;
            await current_tracking.save();
        }
    }

    // aceptar
    _aceptarOrRechazar = async ({ tramite, request, current_tracking, payload, datos, auth, status, boss }) => {
        let is_allow = ['ENVIADO'];
        if (!is_allow.includes(current_tracking.status)) throw new Error(`El trámite no puede ser ${status == 'ACEPTADO' ? 'aceptado' : 'rechazado'}`);
        let pendiente = null;
        let self_dependencia = current_tracking.dependencia_destino_id == current_tracking.dependencia_origen_id ? true : false;
        // generar payload
        datos.description = payload.description;
        datos.user_id = auth.id;
        // validar
        if (status == 'RECHAZADO') {
            // obtener jefe actual
            let current_boss = await this._getCurrentBoss({ tracking: current_tracking, dependencia_id: current_tracking.dependencia_origen_id })
            datos.user_origen_id = current_tracking.user_destino_id;
            datos.user_destino_id = self_dependencia ? current_tracking.user_origen_id : null;
            datos.user_verify_id = self_dependencia ? current_tracking.user_origen_id : current_boss.user_id;
            datos.dependencia_destino_id = current_tracking.dependencia_origen_id;
            datos.dependencia_id = current_tracking.dependencia_origen_id;
            datos.dependencia_origen_id = current_tracking.dependencia_id;
            datos.user_verify_id = self_dependencia ? current_tracking.user_origen_id : current_boss.user_id;
        } else {
            datos.user_destino_id = self_dependencia ? current_tracking.user_destino_id : null;
            datos.user_verify_id = self_dependencia ? auth.id : boss.user_id;
        }
        datos.parent = 1;
        datos.next = 0;
        datos.alert = status == 'RECHAZADO' ? 1 : 0;
        datos.status = 'PENDIENTE';
        datos.files = JSON.stringify([]);
        // generar pendiente
        pendiente = await Tracking.create(datos);
        // actualizar envio
        current_tracking.description = payload.description;
        current_tracking.parent = 0;
        current_tracking.current = 0;
        current_tracking.status = status;
        current_tracking.next = 1;
        current_tracking.state = 0;
        current_tracking.files = JSON.stringify([]);
        await current_tracking.save();
    }

    // responder
    _responder = async ({ tramite, request, current_tracking, payload, datos, auth, boss }) => {
        let is_allow = ['PENDIENTE'];
        if (!is_allow.includes(current_tracking.status)) throw new Error("No se pudo responder el trámite");
        // obtener derivado
        let enviado = null;
        let derivado = await Tracking.query()
            .where('tramite_id', current_tracking.tramite_id)
            .whereIn('status', ['RECHAZADO', 'ACEPTADO'])
            .where('state', 0)
            .orderBy('id', 'DESC')
            .first();
        if (!derivado) throw new Error("No se encontro la dependencia a responder");
        // obtener jefe de la dependencia actual
        let current_boss = await this._getCurrentBoss({ tracking: current_tracking, dependencia_id: derivado.dependencia_id });
        // misma dependencia
        let self_dependencia = current_tracking.dependencia_destino_id == current_tracking.dependencia_origen_id ? true : false;
        // generar payload
        datos.files = await this._saveFile({ request }, tramite.slug);
        datos.description = payload.description;
        datos.user_id = auth.id;
        datos.user_origen_id = current_tracking.user_destino_id;
        datos.user_destino_id = self_dependencia ? derivado.user_destino_id : null;
        datos.user_verify_id = self_dependencia ? derivado.user_destino_id : current_boss.user_id;
        datos.dependencia_id = derivado.dependencia_id;
        datos.dependencia_destino_id = derivado.dependencia_id;
        datos.parent = 0;
        datos.next = 1;
        datos.alert = 0;
        datos.status = 'ENVIADO';
        // generar pendiente
        enviado = await Tracking.create(datos);
        // actualizar envio
        current_tracking.files = datos.files;
        current_tracking.description = payload.description;
        current_tracking.parent = 0;
        current_tracking.current = 0;
        current_tracking.status = 'RESPONDIDO';
        current_tracking.next = 1;
        current_tracking.alert = 0;
        current_tracking.state = 0;
        await current_tracking.save();
    }

    // finalizar
    _finalizar = async ({ tramite, request, current_tracking, payload, auth, boss }) => {
        let is_allow = ['PENDIENTE'];
        // procesar derivado
        if (!is_allow.includes(current_tracking.status)) throw new Error("El trámite no puder ser finalizado");
        current_tracking.status = 'FINALIZADO';
        current_tracking.files = await this._saveFile({ request }, tramite.slug);
        current_tracking.description = payload.description;
        current_tracking.next = 1;
        current_tracking.alert = 0;
        current_tracking.user_id = auth.id;
        await current_tracking.save();
    }

    // anular
    _anulado =  async ({ request, current_tracking, payload, auth, boss }) => {
        let is_allow = ['REGISTRADO'];
        // procesar derivado
        if (!is_allow.includes(current_tracking.status)) throw new Error("El trámite no puder ser anulado");
        current_tracking.files = await this._saveFile({ request }, tramite.slug);
        current_tracking.status = 'ANULADO';
        current_tracking.description = payload.description;
        current_tracking.next = 1;
        current_tracking.alert = 0;
        current_tracking.user_id = auth.id;
        await current_tracking.save();
    }

    // obtener jefe de la dependencia actual
    _getCurrentBoss = async ({ tracking, dependencia_id }) => {
        let tramite = await Tramite.find(tracking.tramite_id);
        if (!tramite) throw new Error("El trámite no existe!");
        let current_boss = await Role.query()
                .where('entity_id', tramite.entity_id)
                .where('dependencia_id', dependencia_id)
                .where('level', 'BOSS')
                .first();
        if (!current_boss) throw new Error("La dependencia no cuenta con un jefe");
        // response
        return current_boss;
    }
    // next = async ({ params, request }) => {
    //     // variable globales
    //     let copy = JSON.parse(request.input('copy')) || [];
    //     let tracking = null;
    //     let file_tmp = null;
    //     let file = null;
    //     let description = null;
    //     let current = 0;
    //     let status = `${request.input('status')}`.toUpperCase();
    //     let message = `El trámite se a ${status.toLowerCase()} correctamente`;
    //     // status permitidos
    //     let allow_verification = ['DERIVADO', 'FINALIZADO', 'ANULADO', 'RESPONDER'];
    //     let allow_validation = ['ACEPTADO', 'RECHAZADO'];
    //     // generar payload
    //     let payload = { 
    //         description: request.input('description'),
    //         files: JSON.stringify([]),
    //         user_id: request.$auth.id,
    //         user_destino_id: request.input('user_destino_id', null),
    //         tramite_id: "",
    //         dependencia_id: request.input('dependencia_destino_id'),
    //         dependencia_origen_id: request._dependencia.id,
    //         dependencia_destino_id: request.input('dependencia_destino_id'),
    //         current: 1,
    //         parent: 0,
    //         alert: 0
    //     }
    //     // validar status
    //     if (allow_verification.includes(status)) {
    //         // validar inputs
    //         await validation(validate, request.all(), {
    //             status: 'required',
    //             description: 'required|max:255'
    //         });
    //         // obtener tracking parent
    //         tracking = await this._getTracking({ params, request }, ['PENDIENTE', 'REGISTRADO'], 1);
    //         await this._configurationError(tracking.status, 'NEXT', tracking.status, tracking.id, 'ASC');
    //         // add files
    //         file_tmp = await this._saveFile({ request }, tracking.slug);
    //         payload.tramite_id = tracking.tramite_id;
    //         payload.files = file_tmp;
    //         // derivar tracking
    //         if (status == 'DERIVADO') {
    //             tracking.dependencia_destino_id = request.input('dependencia_destino_id');
    //             description = request.input('description');
    //             file = file_tmp;
    //             let derivado = await this._derivar({ tracking, request, payload });
    //             message = await this._configuration(derivado.status, 'NEXT', derivado.status, derivado.id, 'ASC') ? message : `El trámite fue derivado, pero aún no podrá ser atendido`;
    //             // generar copia
    //             await this._copies({ 
    //                 request, 
    //                 payload: copy, 
    //                 dependencia_origen_id: payload.dependencia_origen_id, 
    //                 dependencia_destino_id: payload.dependencia_destino_id,
    //                 tramite_id: tracking.tramite_id
    //             });
    //         }
    //         else if(status == 'RESPONDER') {
    //             // get response 
    //             let respuesta = await this._getResponse(tracking)
    //             payload.status = 'ENVIADO';
    //             payload.description = '---';
    //             payload.dependencia_id = tracking.dependencia_origen_id;
    //             payload.dependencia_origen_id = tracking.dependencia_id;
    //             payload.dependencia_destino_id = tracking.dependencia_origen_id;
    //             payload.user_destino_id = respuesta.user_destino_id;
    //             let res = await this._nextTracking({ payload });
    //             message = await this._configuration(res.status, 'NEXT', res.status, res.id, 'ASC') ? message : `El trámite fue respondido, pero aún no podrá ser atendido`;
    //             status = 'RESPONDIDO';
    //             description = request.input('description');
    //             file = file_tmp;
    //             tracking.dependencia_destino_id = tracking.dependencia_origen_id;
    //             // generar copia
    //             await this._copies({ 
    //                 request, 
    //                 payload: copy, 
    //                 dependencia_origen_id: payload.dependencia_origen_id, 
    //                 dependencia_destino_id: payload.dependencia_destino_id,
    //                 tramite_id: tracking.tramite_id
    //             });
    //         } else {
    //             // add file y description
    //             file = file_tmp;
    //             description = request.input('description');
    //             current = 1;
    //             // generar copia
    //             await this._copies({ 
    //                 request, 
    //                 payload: copy, 
    //                 dependencia_origen_id: tracking.dependencia_origen_id, 
    //                 dependencia_destino_id: tracking.dependencia_destino_id,
    //                 tramite_id: tracking.tramite_id
    //             });
    //         }
    //     } else if (allow_validation.includes(status)) {
    //         // validar inputs
    //         await validation(validate, request.all(), {
    //             status: 'required',
    //             description: 'required|max:255'
    //         });
    //         // obtener tracking sin parent
    //         tracking = await this._getTracking({ params, request }, ['ENVIADO', 'REGISTRADO'], 0);
    //         await this._configurationError('ENVIADO', 'NEXT', 'ENVIADO', tracking.id, 'ASC');
    //         // setting payload
    //         payload.user_destino_id = tracking.user_destino_id || null; 
    //         payload.tramite_id = tracking.tramite_id;
    //         payload.dependencia_id = request._dependencia.id;
    //         payload.dependencia_origen_id = tracking.dependencia_origen_id;
    //         payload.dependencia_destino_id = request._dependencia.id;
    //         payload.user_id = request.$auth.id;
    //         payload.parent = 1;
    //         // add file y description
    //         file_tmp = await this._saveFile({ request }, tracking.slug);
    //         file = file_tmp;
    //         description = request.input('description');
    //         // aceptar tracking
    //         if (status == 'ACEPTADO') {
    //             payload.next = tracking.user_destino_id ? 1 : 0;
    //             let aceptado = await this._nextTracking({ payload });
    //             message = await this._configuration('PENDIENTE', 'NEXT', 'PENDIENTE', aceptado.id, 'ASC') ? message : `El trámite fue aceptado, pero aún no podrá ser atendido`;
    //             // generar copia
    //             await this._copies({ 
    //                 request, 
    //                 payload: copy, 
    //                 dependencia_origen_id: payload.dependencia_origen_id, 
    //                 dependencia_destino_id: payload.dependencia_destino_id,
    //                 tramite_id: tracking.tramite_id 
    //             });
    //         }
    //         else {
    //             current = 1;
    //             // generar copia
    //             await this._copies({ 
    //                 request, 
    //                 payload: copy, 
    //                 dependencia_origen_id: tracking.dependencia_origen_id, 
    //                 dependencia_destino_id: tracking.dependencia_destino_id,
    //                 tramite_id: tracking.tramite_id
    //             });
    //         }
    //     } else throw new Error(`El status no está permitido (${allow_verification.join(", ")}, ${allow_validation.join(", ")})`);
    //     // actualizar status del tracking actual
    //     tracking.files = file;
    //     tracking.user_id = request.$auth.id;
    //     tracking.current = current;
    //     tracking.description = description || tracking.description;
    //     tracking.status = status;
    //     tracking.alert = false;
    //     tracking.next = true;
    //     await tracking.save();
    //     // get tramite
    //     let tramite = await Tramite.find(tracking.tramite_id);
    //     tramite.verify = true;
    //     await tramite.save();
    //     // send email tracking 
    //     Event.fire('tracking::notification', request, tramite, tracking);
    //     // generar pendiente cuando se rechaza un documento
    //     if (status == 'RECHAZADO') {
    //         let last_derivado = Tracking.query()
    //             .where('tramite_id', tracking.tramite_id)
    //             .where('status', 'DERIVADO')
    //             .orderBy('id', 'DESC')
    //             .first();
    //         // if (!last_derivado) throw new Error("No se pudo regresar el archivo a la oficina correspondiente!");
    //         // // nuevo pendiente
    //         let newPendiente = JSON.parse(JSON.stringify(payload));
    //         // newPendiente.user_verify_id = last_derivado.user_verify_id;
    //         // newPendiente.user_id = last_derivado.user_id;
    //         newPendiente.dependencia_id = newPendiente.dependencia_origen_id;
    //         newPendiente.dependencia_destino_id = newPendiente.dependencia_origen_id;
    //         newPendiente.alert = true;
    //         newPendiente.status = 'PENDIENTE';
    //         newPendiente.current = 1;
    //         newPendiente.parent = 1;
    //         newPendiente.next = 0;
    //         await Tracking.create(newPendiente);
    //         tramite.verify = false;
    //         await tramite.save();
    //     }
    //     // response
    //     return {
    //         success: true,
    //         status: 201,
    //         code: 'RES_TRACKING_NEXT',
    //         message
    //     }
    // }

    // /**
    //  * Obtener el tracking del tramite
    //  * @param {*} param0 
    //  * @param {*} parent 
    //  */
    _getTracking = async ({ params, request }) => {
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', request._entity.id)
            .where('trackings.dependencia_destino_id', request._dependencia.id)
            .where('trackings.id', params.id)
            .where('trackings.current', 1)
            .where('trackings.state', 1)
            .select('trackings.*')
            .first();
        // validar tracking
        if (!tracking) throw new Error('No se encontró el seguimiento del trámite')
        // response tracking
        return tracking;
    }

    // /**
    //  * guardar file
    //  * @param {*} param0 
    //  */
    _saveFile = async ({ request }, slug) => {
        // get fecha 
        let date = `${moment().format('YYYY-MM-DD')}`.replace('-', "");
        // guardar archivo 
        let file = await Storage.saveFile(request, 'files', {
            size: '6mb',
            extnames: ['pdf', 'docx'],
            multifiles: true
        }, Helpers, {
            path: `tramite/${slug}/tracking/${date.replace("-", "")}`,
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

    // /**
    //  * generar nuevo tracking
    //  * @param {*} param0 
    //  */
    // _nextTracking = async ({ payload }) => {
    //     // save tracking
    //     return await Tracking.create(payload);
    // }

    // /**
    //  * derivar tracking
    //  * @param {*} param0 
    //  */
    // _derivar = async ({ tracking, request, payload }) => {
    //     // get dependencia destino
    //     let dependencia_destino_id = request.input('dependencia_destino_id');
    //     let user_verify_id = tracking.user_verify_id;
    //     // validar revisado
    //     if (!tracking.next) {
    //         // validar role
    //         let role = await this._getRole({ request });
    //         if (!role) dependencia_destino_id = request._dependencia.id;
    //         else if(role.level == 'SECRETARY') dependencia_destino_id = request._dependencia.id; 
    //         else await validation(validate, request.all(), { dependencia_destino_id: 'required' });
    //     } else {
    //         payload.user_verify_id = request.$auth.id;
    //         await validation(validate, request.all(), { dependencia_destino_id: 'required' });
    //     }
    //     // validar dependencia interna
    //     if (dependencia_destino_id == request._dependencia.id) {
    //         if (!dependencia_destino_id) throw new ValidatorError([{ field: 'user_destino_id', message: 'El destinatario es obligatorio' }]);
    //         if (request.input('user_destino_id') == request.$auth.id) throw new ValidatorError([{ field: 'user_destino_id', message: 'Usted no puede ser el destinatario' }]);
    //     }
    //     // change status
    //     payload.status = 'ENVIADO';
    //     payload.dependencia_destino_id = dependencia_destino_id;
    //     payload.dependencia_id = dependencia_destino_id;
    //     payload.next = 1;
    //     // save next tracking
    //     return await this._nextTracking({ payload });
    // }

    // /**
    //  * agregar copia
    //  * @param {*} param0 
    //  */
    // _copies = async ({ request, payload = [], dependencia_origen_id, dependencia_destino_id, tramite_id }) => {
    //     let newPayload = [];
    //     // add ids
    //     await payload.map((p, index) => {
    //         // add _id
    //         p._id = index + 1;
    //         // response
    //         return p;
    //     });
    //     // add collect
    //     let datos = Collect(payload);
    //     let ids = [];
    //     // filtrar duplicados
    //     await datos.map(async d => {
    //         let raw_query = await datos.where('dependencia_id', d.dependencia_id).where('user_id', d.user_id).where('_id', '!=', d._id);
    //         let count = raw_query.count();
    //         let pluck = raw_query.pluck('_id').all();
    //         // validar count 
    //         if (count > 1) {
    //             if (ids.indexOf(d._id) == -1) {
    //                 ids = [...ids, ...pluck];
    //                 newPayload.push(this._formatPayloadCopy({ request, copy: d, dependencia_origen_id, dependencia_destino_id, tramite_id }));
    //             } 
    //         } else {
    //             newPayload.push(this._formatPayloadCopy({ request, copy: d, dependencia_origen_id, dependencia_destino_id, tramite_id }));
    //         }
    //         // response 
    //         return d;
    //     });
    //     // insert copy
    //     let newCopy = await Tracking.createMany(newPayload);
    //     // response
    //     return  newCopy;
    // }

    // /**
    //  * Formato para prepare query copy
    //  * @param {*} param0 
    //  */
    // _formatPayloadCopy = ({ request, copy, dependencia_origen_id, dependencia_destino_id, tramite_id }) => {
    //     return {
    //         tramite_id,
    //         dependencia_id: copy.dependencia_id,
    //         dependencia_origen_id,
    //         dependencia_destino_id,
    //         user_id: request.$auth.id,
    //         user_destino_id: copy.user_id,
    //         description: null,
    //         files: null,
    //         parent: 0,
    //         current: 0,
    //         status: 'COPIA'
    //     }
    // }


    // _configuration = async (key, variable, status, id, orden = 'ASC') => {
    //     let config = await Config.query()
    //         .where('key', key)
    //         .where('variable', variable)
    //         .select('id', 'key', DB.raw('CONVERT(value, SIGNED INTEGER) as value'))
    //         .first();
    //     // validar
    //     if (config) {
    //         let tracking = await Tracking.query()
    //             .where('status', status)
    //             .orderBy('updated_at', orden)
    //             .limit(config.value)
    //             .fetch();
    //         // collect
    //         let result = Collect(await tracking.toJSON());  
    //         // validar tracking
    //         if (result.where('id', id).first()) return true;
    //         // no existe 
    //         return false;
    //     }
    //     // response 
    //     return true;
    // }

    // _configurationError = async (key, variable, status, id, orden = 'ASC') => {
    //     let validar = await  this._configuration(key, variable, status, id, orden);
    //     if (!validar) throw new Error("No se puede realizar la acción, el tracking no está en el rango de la configuración");
    // }

    // // obtener roles
    // _getRole = async ({ request }) => {
    //     let dependencia = request._dependencia;
    //     let entity = request._entity;
    //     let auth = request.$auth;
    //     let role = await Role.query() 
    //         .where('entity_id', entity.id)
    //         .where('dependencia_id', dependencia.id)
    //         .where('user_id', auth.id)
    //         .first();
    //     return role;
    // }
}

module.exports = TrackingController
