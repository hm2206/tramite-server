'use strict'

const Tracking = use('App/Models/Tracking');
const Tramite = use('App/Models/Tramite');
const Role = use('App/Models/Role');
const { validateAll } = use('Validator');
const { validation, ValidatorError } = require('validator-error-adonis');
const CustomException = require('../../Exceptions/CustomException');
const FileController = require('./FileController');
const moment = require('moment');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const { collect } = require('collect.js');
const Info = use('App/Models/Info');
const DB = use('Database');
const File = use('App/Models/File');

class NextController {

    trx = null;
    status = "";
    multiple = [];
    role = null;
    boss = null;
    entity = {};
    dependencia = {};
    auth = {};
    tracking = {};
    actions = {
        REGISTRADO: ['ANULADO', 'ENVIADO'],
        PENDIENTE: ['DERIVADO', 'RESPONDIDO', 'FINALIZADO'],
        RECIBIDO: ['ACEPTADO', 'RECHAZADO'],
        COPIA: ['ACEPTADO'],
    };
    hidden = ['REGISTER'];

    // obtener tracking
    _getTracking = async ({ params, request }) => {
        // obtener tracking
        this.tracking = await Tracking.query()
            .with('tramite')
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', this.entity.id)
            .where('trackings.dependencia_id', this.dependencia.id)
            .where('trackings.id', params.id)
            .where('trackings.current', 1)
            .select('trackings.*')
            .first();
        // validar
        if (!this.tracking) throw new NotFoundModelException("el seguimiento");
        if (this.hidden.includes(this.tracking.status)) {
            if (this.tracking.visible == 1) throw new CustomException(`El trámite ya fué verificado`);
        } else {
            if (this.tracking.visible == 0) throw new CustomException(`El trámite aún no está verificado`);
        }
    }

    // obtener user
    _getUser = async ({ id , request }) => {
        let response = await request.api_authentication.get(`user/${id}`)
            .then(res => res.data)
            .catch(err => ({ success: false, user: {} }));
        // validar usuario
        if (!response.success) throw new CustomException("El usuario no existe!");
        // response
        return response.user;
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
        if (!this.tracking.next) {
            let current_action = this.actions[this.tracking.status];
            if (typeof current_action == 'undefined') throw new Error("No se puede procesar el trámite");
            if (!current_action.includes(status || "")) throw new ValidatorError([{ field: 'status', message: 'El status es invalido!' }]);
            this.status = status;
        } else {
            if (this.tracking.next != status) throw new Error(`La acción "${status}" es incorrecta!`);
            this.status = status;
        }
    }

    // desahabilitar tracking actual
    _disableTrackingCurrent = async () => {
        let payload = { current: 0, visible: 0 };
        if (!this.tracking.readed_at) payload.readed_at = moment().format('YYYY-MM-DD hh:mm:ss');
        // preparate
        this.tracking.merge(payload);
        await this.tracking.save();
    }

    // desabilitar todos los current
    _disableCurrent = async () => {
        // quitar tracking actual
        await Tracking.query()
            .where('tramite_id', this.tracking.tramite_id)
            .update({ current: 0 }, this.trx);
        // deshabilitar por status
        await Tracking.query()
            .where('tramite_id', this.tracking.tramite_id)
            .where('current', 0)
            .whereIn('status', ['REGISTRADO', 'PENDIENTE', 'ENVIADO'])
            .update({ visible: 0 }, this.trx);
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

    // obtener al boss
    _getBoss = async (dependencia_id) => {
        return await Role.query()
            .where('dependencia_id', dependencia_id)
            .where('entity_id', this.entity.id)
            .where('level', 'BOSS')
            .first();
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
        this.multiple = request.input('multiple') ? JSON.parse(request.input('multiple')) : [];
        this.is_action = request.input('is_action') == 1 ? true : false;
        // obtener tracking
        await this._getTracking({ params, request });
        await this._validateAction(request.input('status'));
        await this._switchModo();
        // guardar transacción
        this.trx = await DB.beginTransaction();
        // tracking
        let newTracking = await this[`_${this.status.toLowerCase()}`].apply(this, [{ params, request }]);
        // response
        return {
            success: true,
            status: 201,
            message: `El trámite fué: ${this.status.toUpperCase()}, correctamente!`,
            tracking: newTracking,
        }
    } 

    _count_file_observer = async () => {
        return await File.query()
            .where('object_type', 'App/Models/Tramite')
            .where('object_id', this.tracking.tramite_id)
            .whereNotNull('observation')
            .getCount('id');
    }

    _actionStatus = (status_default = null) => {
        status_default = 'RECIBIDO';
        return this.is_action ? status_default : 'COPIA';
    }

    _enviado = async ({ params, request }) => {
        let rules = {
            dependencia_destino_id: "required"
        }
        // validar archivo observador
        let count_file_observer = await this._count_file_observer();
        if (count_file_observer) throw new CustomException("Existe uno o varios archivos observados");
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
        // generar recibido
        let payload_recibido = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: request.input('dependencia_destino_id'),
            person_id: null,
            user_verify_id: null,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            is_action: this.is_action,
            status: this._actionStatus(),
            readed_at: null
        }
        // validar tramite interno
        if (!self_dependencia) {
            let current_boss = await this._getBoss(payload_recibido.dependencia_id);
            if (!current_boss) throw new CustomException("No se puede derivar a la dependencia por que no cuenta con un jefe");
            // obtener user
            let current_user = await this._getUser({ id: current_boss.user_id, request });
            payload_recibido.user_verify_id = current_user.id;
            payload_recibido.modo = 'DEPENDENCIA';
            payload_recibido.person_id = current_user.person_id;
        } else {
            payload_recibido.user_verify_id = request.input('user_destino_id');
            // obtener los datos
            let current_user = await this._getUser({ id: payload_recibido.user_verify_id, request });
            payload_recibido.person_id = current_user.person_id;
        }
        // crear derivado
        let payload_derivado = Object.assign({}, payload_recibido);
        payload_derivado.dependencia_id = this.tracking.dependencia_id;
        payload_derivado.user_verify_id = this.tracking.user_verify_id;
        payload_derivado.person_id = this.tracking.person_id;
        payload_derivado.current = 0;
        payload_derivado.status = 'ENVIADO';
        try {
            // obtener info
            await this._info({ request, onlyDescription: false }, (info) => {
                payload_derivado.info_id = info.id;
                payload_recibido.info_id = info.id;
            });
            // crear recibido
            let recibido = await Tracking.create(payload_recibido, this.trx);
            // agregar tracking_id al derivado
            payload_derivado.tracking_id = recibido.id;
            // crear derivado
            let derivado = await Tracking.create(payload_derivado, this.trx);
            // deshabilitar tracking actual
            this._disableTrackingCurrent();
            // generar copia
            await this._multiple({ dependencia_id: request.input('dependencia_detino_id'), current_tracking: derivado });
            // guardar cambios
            this.trx.commit();
            // config tracking
            return derivado;
        } catch (error) {
            // cancelar cambios
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            this.trx.rollback();
            throw new CustomException("No se pudó procesar la acción");
        }
    }

    // derivar
    _derivado = async ({ params, request }) => {
        let rules = {
            dependencia_destino_id: "required"
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
        // generar recibido
        let payload_recibido = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: request.input('dependencia_destino_id'),
            person_id: null,
            user_verify_id: null,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            status: this._actionStatus(),
            is_action: this.is_action,
            readed_at: null
        }
        // validar tramite interno
        if (!self_dependencia) {
            let current_boss = await this._getBoss(payload_recibido.dependencia_id);
            if (!current_boss) throw new CustomException("No se puede derivar a la dependencia por que no cuenta con un jefe");
            // obtener user
            let current_user = await this._getUser({ id: current_boss.user_id, request });
            payload_recibido.user_verify_id = current_user.id;
            payload_recibido.modo = 'DEPENDENCIA';
            payload_recibido.person_id = current_user.person_id;
        } else {
            payload_recibido.user_verify_id = request.input('user_destino_id');
            // obtener los datos
            let current_user = await this._getUser({ id: payload_recibido.user_verify_id, request });
            payload_recibido.person_id = current_user.person_id;
        }
        // crear derivado
        let payload_derivado = Object.assign({}, payload_recibido);
        payload_derivado.dependencia_id = this.tracking.dependencia_id;
        payload_derivado.user_verify_id = this.tracking.user_verify_id;
        payload_derivado.person_id = this.tracking.person_id;
        payload_derivado.current = 0;
        payload_derivado.status = 'DERIVADO';
        try {
            // obtener info
            await this._info({ request, onlyDescription: false }, (info) => {
                payload_derivado.info_id = info.id;
                payload_recibido.info_id = info.id;
            });
            // crear recibido
            let recibido = await Tracking.create(payload_recibido, this.trx);
            // agregar tracking_id al derivado
            payload_derivado.tracking_id = recibido.id;
            // crear derivado
            let derivado = await Tracking.create(payload_derivado, this.trx);
            // deshabilitar tracking actual
            this._disableTrackingCurrent();
            // generar copia
            await this._multiple({ dependencia_id: request.input('dependencia_detino_id'), current_tracking: derivado });
            // guardar cambios
            this.trx.commit();
            // config tracking
            return derivado;
        } catch (error) {
            // cancelar cambios
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            this.trx.rollback();
            throw new CustomException("No se pudó procesar la acción");
        }
    }

    // anular
    _anulado = async ({ params, request }) => {
        // transacción
        let payload = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking.dependencia_id,
            person_id: this.tracking.person_id,
            user_verify_id: this.tracking.user_verify_id,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 0,
            first: 0,
            modo: this.tracking.modo,
            status: 'ANULADO',
            readed_at: null
        };
        // verificar modo 
        await this._validateModo();
        // crear anulado
        let anulado = await Tracking.create(payload);
        // deshabilitar tracking
        await this._disableTrackingCurrent();
        // deshabilitar tramite
        await Tramite.query()
            .where('id', this.tracking.tramite_id)
            .update({ state: 0 });
        // response
        return anulado
    }

    // aceptar
    _aceptado = async ({ params, request }) => {
        // validar modo
        await this._validateModo();
        // obtener tracking origen
        let origen = await Tracking.find(this.tracking.tracking_id);
        let is_first = this.tracking.first ? true : false;
        if (is_first) origen = this.tracking;
        if (!origen) throw new CustomException("No se encontró la dependencia de origen");
        // generar aceptado
        let payload_aceptado = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: origen.dependencia_id,
            person_id: origen.person_id,
            user_verify_id: origen.user_verify_id,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: is_first ? 0 : 1,
            current: 0,
            first: 0,
            modo: this.tracking.modo,
            status: 'ACEPTADO',
            readed_at: is_first ? moment().format('YYYY-MM-DD hh:mm:ss') : null,
        };
        // generar payload pendiente
        let payload_pendiente = Object.assign({}, payload_aceptado);
        // procesar datos
        try {
            // obtener info
            await this._info({ request }, (info) => {
                payload_aceptado.info_id = info.id;
                payload_pendiente.info_id = info.id;
            });
            // crear aceptado
            let aceptado = await Tracking.create(payload_aceptado, this.trx);
            // obtener usuario actual
            let current_user = await this._getUser({ id: this.tracking.user_verify_id, request });
            // genearar pendiente
            payload_pendiente.dependencia_id = this.tracking.dependencia_id;
            payload_pendiente.person_id = current_user.person_id;
            payload_pendiente.user_verify_id = current_user.id;
            payload_pendiente.tracking_id = aceptado.id;
            payload_pendiente.revisado = this.tracking.is_action ? 0 : 1;
            payload_pendiente.current = 1;
            payload_pendiente.visible = 1;
            payload_pendiente.modo = this.tracking.modo;
            payload_pendiente.readed_at = null;
            payload_pendiente.status = this.tracking.is_action ? 'PENDIENTE' : 'FINALIZADO';
            // crear pendiente
            let pendiente = await Tracking.create(payload_pendiente, this.trx);
            // deshabilitar tracking
            await this._disableTrackingCurrent();
            // guardar cambios
            this.trx.commit();
            // response
            return pendiente;
        } catch (error) {
            // cancelar cambios
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            this.trx.rollback();
            throw new CustomException("No se pudó procesar la acción");
        }
    }

    // rechazar
    _rechazado = async ({ params, request }) => {
        // validar modo
        await this._validateModo();
        // obtener origen
        let origen = await Tracking.find(this.tracking.tracking_id);
        let is_first = this.tracking.first;
        if (is_first) origen = this.tracking;
        if (!origen) throw new CustomException("No se encontró la dependencia de origen");
        // generar pendiente
        let payload_pendiente = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: origen.dependencia_id,
            person_id: origen.person_id,
            user_verify_id: origen.user_verify_id,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 0,
            visible: is_first ? 0 : 1,
            current: 1,
            first: 0,
            alert: 1,
            modo: this.tracking.modo,
            next: origen.next,
            status: 'PENDIENTE',
            readed_at: is_first ? moment().format('YYYY-MM-DD hh:mm:ss') : null,
        };
        // generar payload rechazado
        let payload_rechazado = Object.assign({}, payload_pendiente);
        // procesar tracking
        try {
            // obtener info
            await this._info({ request }, (info) => {
                payload_pendiente.info_id = info.id;
                payload_rechazado.info_id = info.id;
            });
            // crear pendiente
            let pendiente = await Tracking.create(payload_pendiente, this.trx);
            // obtener rechazado
            payload_rechazado.dependencia_id = this.tracking.dependencia_id;
            payload_rechazado.person_id = this.tracking.person_id;
            payload_rechazado.user_verify_id = this.tracking.user_verify_id;
            payload_rechazado.tracking_id = pendiente.id;
            payload_rechazado.revisado = 1;
            payload_rechazado.visible = 1;
            payload_rechazado.alert = 0;
            payload_rechazado.current = 0;
            payload_rechazado.next = null;
            payload_rechazado.status = 'RECHAZADO';
            // crear rechazado
            let rechazado = await Tracking.create(payload_rechazado, this.trx);
            // deshabilitar tracking
            await this._disableTrackingCurrent();
            // guardar cambios
            this.trx.commit();
            // response
            return rechazado;
        } catch (error) {
            // cancelar cambios
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            this.trx.rollback();
            throw new CustomException(error.message);
        }
    }

    // responder
    _respondido = async ({ params, request }) => {
        // validar modo
        await this._validateModo();
        // obtener origen
        let origen = await Tracking.query()
            .where("id", this.tracking.tracking_id)
            .first();
        if (!origen) throw new CustomException("No se encontró la oficina de origen");
        // generar recibido
        let payload_recibido = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: origen.dependencia_id,
            person_id: origen.person_id,
            user_verify_id: origen.user_verify_id,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            modo: this.tracking.dependencia_id != origen.dependencia_id ? 'DEPENDENCIA' : 'YO',
            status: 'RECIBIDO',
            readed_at: null
        }
        // generar respondido 
        let payload_respondido = Object.assign({}, payload_recibido);
        // processar datos
        try {
            // obtener info
            await this._info({ request, onlyDescription: false }, (info) => {
                payload_recibido.info_id = info.id;
                payload_respondido.info_id = info.id;
            });
            // setting payload respondido
            payload_respondido.tramite_id = this.tracking.tramite_id;
            payload_respondido.dependencia_id = this.tracking.dependencia_id;
            payload_respondido.person_id = this.tracking.person_id;
            payload_respondido.user_verify_id = this.tracking.user_verify_id;
            payload_respondido.current = 0;
            payload_respondido.modo = this.tracking.dependencia_id != origen.dependencia_id ? 'DEPENDENCIA' : 'YO';
            payload_respondido.status = 'RESPONDIDO';
            // crear recibido
            let recibido = await Tracking.create(payload_recibido, this.trx);
            // obtener tracking id
            payload_respondido.tracking_id = recibido.id;
            // crear respondido
            let respondido = await Tracking.create(payload_respondido, this.trx);
            // deshabilitar tracking actual
            this._disableTrackingCurrent();
            // guardar cambios
            this.trx.commit();
            // response
            return respondido;
        } catch (error) {
            // cancelar cambios
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            this.trx.rollback();
            throw new CustomException(error.message);
        }
    }

    // finalizar
    _finalizado = async ({ params, request }) => {
        // generar finalizado
        let payload = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking.dependencia_id,
            person_id: this.tracking.person_id,
            user_verify_id: this.tracking.user_verify_id,
            user_id: this.auth.id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 1,
            modo: this.tracking.modo,
            status: 'FINALIZADO',
            readed_at: null
        }
        // procesar tracking
        try {
            // obtener info
            await this._info({ request }, (info) => {
                payload.info_id = info.id;
            });
            // verificar modo 
            await this._validateModo();
            // crear anulado
            let finalizado = await Tracking.create(payload, this.trx);
            // deshabilitar tracking
            await this._disableTrackingCurrent();
            // cambiar estado
            await Tramite.query()
                .where('id', finalizado.tramite_id)
                .update({ state : 0 });
            // guardar cambios
            this.trx.commit();
            // response
            return finalizado;
        } catch (error) {
            // cancelar cambios
            this.trx.rollback();
            this.tracking.merge({ visible: 1, current: 1 });
            await this.tracking.save();
            await Tramite.query().where('id', this.tracking.tramite_id).update({ state : 1 });
            throw new CustomException(error.message);
        }
    }

    // multiple
    _multiple = async ({ dependencia_id = '', current_tracking, status_action }) => {
        // validar permitidos
        let allow = ['DERIVADO', 'ENVIADO'];
        if (!this.multiple.length) return false;
        if (!allow.includes(this.status)) return false;
        this.multiple = collect(this.multiple || []);
        let ids = this.multiple.pluck('id').toArray();
        let roles = Role.query()
            .where('entity_id', this.entity.id);
        // filtrar dependencia
        if (dependencia_id) roles.whereNotIn('dependencia_id', [dependencia_id])
        // obtener datos
        roles = await roles.whereIn('dependencia_id', ids)
            .where('level', 'BOSS')
            .fetch();
        roles = collect(await roles.toJSON());
        // datos reales
        let payload = collect([]);
        // filtrar
        await this.multiple.map(async m => {
            let exists = await roles.where('dependencia_id', parseInt(m.id)).first();
            if (exists) {
                // recibido
                payload.push({
                    tramite_id: this.tracking.tramite_id,
                    dependencia_id: exists.dependencia_id,
                    person_id: exists.person_id,
                    user_verify_id: exists.user_id,
                    user_id: this.auth.id,
                    tracking_id: current_tracking.id,
                    current: 1,
                    visible: 1,
                    revisado: 1,
                    first: 0,
                    modo: 'DEPENDENCIA',
                    is_action: m.action ? 1 : 0,
                    status: m.action ? 'RECIBIDO' : 'COPIA'
                });
            }
        });
        // generar copia
        await Tracking.createMany(payload.toArray(), this.trx);
        // activar modo multiple
        current_tracking.merge({ multiple: 1 });
        await current_tracking.save(this.trx);
    }

    // info
    _info = async ({ request, onlyDescription = true }, callback = null) => {
        let description = request.input('description', '');
        let isFiles = request.file('files');
        if ((!onlyDescription && (isFiles || description)) || (onlyDescription && description)) {
            let info = await Info.create({ description }, this.trx);
            // processar archivos
            if (isFiles) {
                let apiFile = new FileController();
                request.object_id = info.id;
                request.object_type = 'App/Models/Info';
                request.object_file = info;
                let files = await apiFile.store({ request });
            }
            return typeof callback == 'function' ? callback(info) : info;
        }
        // response error
        return null;
    }
}

module.exports = NextController;
