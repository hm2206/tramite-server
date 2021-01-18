'use strict'

const Tracking = use('App/Models/Tracking');
const Role = use('App/Models/Role');
const Helpers = use('Helpers');
const { validateAll } = use('Validator');
const { Storage, validation, ValidatorError } = require('validator-error-adonis');
const CustomException = require('../../Exceptions/CustomException');
const FileController = require('./FileController');
const moment = require('moment');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');

class NextController {

    status = "";
    role = null;
    boss = null;
    entity = {};
    dependencia = {};
    auth = {};
    tracking = {};
    actions = {
        REGISTRADO: ['ANULADO', 'DERIVADO'],
        PENDIENTE: ['DERIVADO', 'RESPONDIDO', 'FINALIZADO'],
        ENVIADO: ['ACEPTADO', 'RECHAZADO']
    };

    // obtener tracking
    _getTracking = async ({ params, request }) => {
        // obtener tracking
        this.tracking = await Tracking.query()
            .with('tramite')
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', this.entity.id)
            .where('trackings.dependencia_id', this.dependencia.id)
            .where('trackings.id', params.id)
            .where('trackings.revisado', 1)
            .where('trackings.current', 1)
            .select('trackings.*')
            .first();
        // validar
        if (!this.tracking) throw new NotFoundModelException("el seguimiento");
    }

    // obtener user
    _getUser = async ({ id , request }) => {
        return await request.api_authentication.get(`user/${id}`)
            .then(res => res.data)
            .catch(err => ({}));
    }
    
    // guardar datos
    _saveFiles = async ({ request, id }) => {
        request.object_type = 'App/Models/Tracking';
        request.object_id = id;
        let files = new FileController();
        if (request.file('files')) await files.store({ request });
    }

    // validate acción
    _validateAction = async (status) => {
        let current_action = this.actions[this.tracking.status];
        if (typeof current_action == 'undefined') throw new Error("No se puede procesar el trámite");
        if (!current_action.includes(status || "")) throw new ValidatorError([{ field: 'status', message: 'El status es invalido!' }]);
        this.status = status;
    }

    // desabilitar todos los current
    _disableCurrent = async () => {
        // quitar tracking actual
        await Tracking.query()
            .where('tramite_id', this.tracking.tramite_id)
            .update({ current: 0, visible: 0 });
    }

    // switch modo
    _switchModo = async () => {
        // obtener role actual
        this.role = await Role.query()
            .where('entity_id', this.entity.id)
            .where('dependencia_id', this.dependencia.id)
            .where('user_id', this.auth.id)
            .first();
        // obtener role de boss
        this.boss = await Role.query()
            .where('entity_id', this.entity.id)
            .where('dependencia_id', this.dependencia.id)
            .where('level', 'BOSS')
            .first();
        // validar 
        if (this.tracking.modo == 'DEPENDENCIA')
            if (!this.boss) throw new CustomException("La dependencia actual no cuenta con un jefe");
    }

    // validar modo
    _validateModo = async () => {
        if (this.tracking.modo == 'DEPENDENCIA') {
            if (!this.role) throw new CustomException("Usted no puede realizar la acción");
        } else {
            if (this.tracking.user_verify_id != this.auth.id) throw new CustomException("Usted no es el protietario del seguímiento!");
        }
    }

    // manejador
    handle = async ({ params, request }) => {
        // validar status
        await validation(validateAll, request.all(), {
            status: 'required|max:30'
        });
        // obtener meta datos
        this.entity = request.$entity;
        this.dependencia = request.$dependencia;
        this.auth = request.$auth;
        // obtener tracking
        await this._getTracking({ params, request });
        await this._validateAction(request.input('status'));
        await this._switchModo();
        // tracking
        let newTracking = await this[`_${this.status.toLowerCase()}`].apply(this, [{ params, request }]);
        // response
        return {
            success: true,
            status: 201,
            message: `El trámite fué: ${this.status.toUpperCase()}, correctamente!`,
            tracking: newTracking
        }
    }

    // derivar
    _derivado = async ({ params, request }) => {
        let rules = {
            dependencia_destino_id: "required",
            description: 'required|max:255'
        }
        // validar si es a la misma dependencia
        let self_dependencia = this.dependencia.id == request.input('dependencia_destino_id') ? 1 : 0;
        if (self_dependencia) rules.user_destino_id = 'required';
        // validar salida del documento
        if (!self_dependencia && this.boss.user_id != this.auth.id) {
            if (this.tracking.modo != 'DEPENDENCIA') throw new CustomException("Usted no puede derivar el trámite fuera de la dependencia");
            if (!this.role) throw new CustomException("Usted no cuenta con un rol para derivar el trámite fuera de la dependencia");
        }
        // validar request
        await validation(validateAll, request.all(), rules);
        // validar user
        if (self_dependencia && this.auth.id == request.input('user_destino_id'))  
            throw new ValidatorError([{ field: 'user_destino_id', message: 'Usted no puede ser el usuario destino' }]);
        // json tracking
        let current_tracking = await this.tracking.toJSON();
        delete current_tracking.id
        delete current_tracking.tramite;
        current_tracking.created_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.updated_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.revisado = 1;
        current_tracking.first = 0;
        // generar payload de envio yn derivado
        let payload_enviado = Object.assign({}, current_tracking);
        let payload_derivado = Object.assign({}, current_tracking);
        // config datos
        payload_enviado.description = request.input('description');
        payload_enviado.user_id = this.auth.id;
        payload_enviado.dependencia_destino_id = request.input('dependencia_destino_id');
        payload_enviado.dependencia_id = request.input('dependencia_destino_id');
        payload_enviado.dependencia_origen_id = current_tracking.dependencia_id;
        payload_enviado.alert = 0;
        payload_enviado.current = 1;
        payload_enviado.visible = 1;
        payload_enviado.status = 'ENVIADO';
        // validar tramite interno
        if (!self_dependencia) {
            let current_boss = await Role.query()
                .where('dependencia_id', payload_enviado.dependencia_id)
                .where('entity_id', this.entity.id)
                .where('level', 'BOSS')
                .first();
            if (!current_boss) throw new CustomException("No se puede derivar a la dependencia por que no cuenta con un jefe");
            // obtener user
            let current_user = await this._getUser({ id: current_boss.user_id, request });
            if (!Object.keys(current_user).length) throw new CustomException("El usuario no existe!");
            payload_enviado.user_verify_id = current_user.id;
            payload_enviado.modo = 'DEPENDENCIA';
            payload_derivado.person_id = current_user.person_id;
        } else {
            payload_enviado.user_verify_id = request.input('user_destino_id');
            if (payload_enviado.user_verify_id == this.auth.id) 
                throw new ValidatorError([{field: 'user_destino_id', message: 'Usted no puede ser el destinatario'}]);
            // obtener los datos
            let current_user = await this._getUser({ id: payload_enviado.user_verify_id, request });
            if (!Object.keys(current_user).length) throw new CustomException("El usuario no existe");
            payload_derivado.person_id = current_user.person_id;
        }
        // configurar derivado
        payload_derivado.dependencia_origen_id = current_tracking.dependencia_id;
        payload_derivado.dependencia_destino_id = payload_enviado.dependencia_id;
        payload_derivado.modo = payload_enviado.modo;
        payload_derivado.revisado = 1;
        payload_derivado.visible = 1;
        payload_derivado.current = 0;
        payload_derivado.status = this.status;
        // deshabilitar visibilidad
        await this._disableCurrent();
        // crear derivado
        let derivado = await Tracking.create(payload_derivado);
        let enviado = await Tracking.create(payload_enviado);
        // validar files
        try {
            await this._saveFiles({ request, id: enviado.id });
            // response
            return enviado;
        } catch (error) {
            await derivado.delete();
            await enviado.delete();
            // restaurar
            this.tracking.current = 1;
            this.tracking.visible = 1;
            await this.tracking.save();
            // response
            return this.tracking;
        }
    }

    // anular
    _anulado = async ({ params, request }) => {
        // validar
        await validation(validateAll, request.all(), {
            description: 'required|max:255'
        });
        // transacción
        let current_tracking = await this.tracking.toJSON();
        delete current_tracking.id;
        delete current_tracking.tramite;
        let payload = { ...current_tracking };
        payload.status = this.status;
        payload.user_id = this.auth.id;
        payload.first = 0;
        payload.revisado = 1;
        payload.current = 1;
        payload.description = request.input('description');
        // verificar modo 
        await this._validateModo();
        // deshabilitar visibilidad
        await this._disableCurrent();
        // crear anulado
        return await Tracking.create(payload);
    }

    // aceptar
    _aceptado = async ({ params, request }) => {
        // validar
        await validation(validateAll, request.all(), {
            description: 'required|max:255'
        });
        // validar modo
        await this._validateModo();
        // json tracking
        let current_tracking = await this.tracking.toJSON();
        delete current_tracking.id;
        delete current_tracking.tramite;
        current_tracking.created_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.updated_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.user_id = this.auth.id;
        current_tracking.revisado = current_tracking.user_verify_id == this.auth.id ? 1 : 0;
        current_tracking.first = 0;
        current_tracking.alert = 0;
        current_tracking.visible = 1;
        // generar pendiente
        let payload_pendiente = Object.assign({}, current_tracking);
        payload_pendiente.current = 1;
        payload_pendiente.description = null;
        payload_pendiente.status = "PENDIENTE";
        // geenrar aceptado
        let payload_aceptado = Object.assign({}, current_tracking);
        payload_aceptado.description = request.input('description');
        payload_aceptado.dependencia_id = current_tracking.dependencia_origen_id;
        payload_aceptado.current = 0;
        payload_aceptado.revisado = 1;
        payload_aceptado.status = this.status;
        // obtener notificación
        let notificar = await Tracking.query()
            .where('dependencia_id', payload_aceptado.dependencia_id)
            .whereIn('status', ['DERIVADO', 'RESPONDIDO'])
            .orderBy('id', 'DESC')
            .first();
        // valdiar derivanotificacióndo
        if (!notificar) throw new CustomException("No se encontró la dependencia a donde notificar");
        payload_aceptado.user_verify_id = notificar.user_verify_id;
        payload_aceptado.person_id = notificar.person_id;
        // deshabilitar cadena
        await this._disableCurrent();
        // crear aceptado
        let aceptado = await Tracking.create(payload_aceptado);
        // crear pendiente
        let pendiente = await Tracking.create(payload_pendiente);
        // response
        return pendiente;
    }

    // rechazar
    _rechazado = async ({ params, request }) => {
        // validar
        await validation(validateAll, request.all(), {
            description: 'required|max:255'
        });
        // validar modo
        await this._validateModo();
        // json tracking
        let current_tracking = await this.tracking.toJSON();
        delete current_tracking.id;
        delete current_tracking.tramite;
        current_tracking.created_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.updated_at = moment().format('YYYY-MM-DD hh:mm:ss');
        current_tracking.user_id = this.auth.id;
        current_tracking.revisado = current_tracking.user_verify_id == this.auth.id ? 1 : 0;
        current_tracking.first = 0;
        current_tracking.alert = 0;
        current_tracking.visible = 1;
        // generar pendiente
        let payload_pendiente = Object.assign({}, current_tracking);
        payload_pendiente.dependencia_id = current_tracking.dependencia_origen_id;
        payload_pendiente.dependencia_origen_id = current_tracking.dependencia_id;
        payload_pendiente.dependencia_destino_id = current_tracking.dependencia_origen_id;
        payload_pendiente.current = 1;
        payload_pendiente.description = request.input('description');
        payload_pendiente.status = "PENDIENTE";
        // geenrar aceptado
        let payload_rechazado = Object.assign({}, current_tracking);
        payload_rechazado.description = null;
        payload_rechazado.dependencia_origen_id = current_tracking.dependencia_origen_id;
        payload_rechazado.dependencia_destino_id = current_tracking.dependencia_id;
        payload_rechazado.current = 0;
        payload_rechazado.status = this.status;
        // obtener notificación
        let notificar = await Tracking.query()
            .where('dependencia_id', payload_pendiente.dependencia_id)
            .whereIn('status', ['DERIVADO', 'RESPONDIDO'])
            .orderBy('id', 'DESC')
            .first();
        // valdiar derivanotificacióndo
        if (!notificar) throw new CustomException("No se encontró la dependencia a donde notificar");
        payload_pendiente.user_verify_id = notificar.user_verify_id;
        payload_pendiente.person_id = notificar.person_id;
        // deshabilitar cadena
        await this._disableCurrent();
        // crear aceptado
        let rechazado = await Tracking.create(payload_rechazado);
        // crear pendiente
        let pendiente = await Tracking.create(payload_pendiente);
        // response
        return pendiente;
    }

    // responder
    _respondido = async ({ params, request }) => {
        // validar
        await validation(validateAll, request.all(), {
            description: 'required|max:255'
        });
        // validar modo
        await this._validateModo();
        // obtener current tracking
        let current_tracking = await this.tracking.toJSON();
        delete current_tracking.tramite;
        delete current_tracking.id;
        // obtener oficina origen
        let oficina_origen = await Tracking.query()
            .where('tramite_id', this.tracking.tramite_id)
            .where('dependencia_id', this.tracking.dependencia_origen_id)
            .where('visible', 1)
            .first();
        if (!oficina_origen) throw new CustomException("No se encotró al destinatario para responder");
        let payload_pendiente = await oficina_origen.toJSON();
        delete payload_pendiente.id 
        payload_pendiente.user_id = this.auth.id;
        payload_pendiente.dependencia_origen_id = this.dependencia.id;
        payload_pendiente.description = request.input('description');
        payload_pendiente.current = 1;
        payload_pendiente.status = 'ENVIADO';
        // generar respondido
        let payload_respondido = Object.assign({}, current_tracking);
        payload_respondido.dependencia_origen_id = this.dependencia.id;
        payload_respondido.dependencia_destino_id = payload_pendiente.dependencia_id;
        payload_respondido.user_id = this.auth.id;
        payload_respondido.status = this.status;
        // deshabilitar visibilidad
        await this._disableCurrent();
        // generar datos
        let respondido = await Tracking.create(payload_respondido);
        let pendiente = await Tracking.create(payload_pendiente);
        // validar files
        try {
            await this._saveFiles({ request, id: pendiente.id });
            // response
            return pendiente;
        } catch (error) {
            await respondido.delete();
            await pendiente.delete();
            // restaurar
            this.tracking.current = 1;
            this.tracking.visible = 1;
            await this.tracking.save();
            // response
            return this.tracking;
        }
    }
}

module.exports = NextController;
