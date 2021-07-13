'use static';

const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const File = use('App/Models/File');
const NotFoundModelException = require('../Exceptions/NotFoundModelException');
const CustomException = require('../Exceptions/CustomException');
const Role = use('App/Models/Role');
const DB = use('Database');
const Info = use('App/Models/Info');
const FileEntity = require('./FileEntity');
const { validation } = require('validator-error-adonis');
const moment = require('moment');
const collect = require('collect.js');

class NextEntity {

    trx = null;
    status = "";
    entity_id = "";
    dependencia_id = "";
    user_id = null;
    tramite = {};
    tracking = {};
    tracking_origen = {};
    authentication = {};
    body = {};
    request = null;

    current_boss = null;
    current_role = null;
    destino_boss = null;

    current_user = null;

    is_externo = false;
    is_privated = false;

    hidden = ['REGISTER'];
    actions = {
        REGISTRADO: ['ANULADO', 'ENVIADO'],
        SUBTRAMITE: ['ANULADO', 'ENVIADO'],
        PENDIENTE: ['DERIVADO', 'RESPONDIDO', 'FINALIZADO'],
        RECIBIDO: ['ACEPTADO', 'RECHAZADO']
    }

    is_action = 1;
    multiple = [];
    users = [];

    constructor (authentication = {}, entity_id, dependencia_id, user_id = "") {
        this.authentication = authentication;
        this.entity_id = entity_id;
        this.dependencia_id = dependencia_id;
        this.user_id = user_id;
    }

    setRequest(request) {
        this.request = request;
    }

    setMultiple(multiple = []) {
        this.multiple = multiple;
    }

    setUsers(users = []) {
        this.users = users;
    }

    setIsAction(is_action = 1) {
        this.is_action = is_action;
    }

    setIsExterno(is_externo = false) {
        this.is_externo = is_externo;
    }

    async getTracking(id) {
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', this.entity_id)
            .where('trackings.dependencia_id', this.is_externo ? null : this.dependencia_id)
            .where('trackings.id', id)
            .where('trackings.current', 1)
            .orderBy('trackings.id', 'DESC')
            .select('trackings.*')
            .first();
        // validar
        if (!tracking) throw new NotFoundModelException("el seguimiento");
        if (this.hidden.includes(tracking.status)) {
            if (tracking.visible == 1) throw new CustomException(`El trámite ya fué verificado`);
        } else {
            if (tracking.visible == 0) throw new CustomException(`El trámite aún no está verificado`);
        }
        // agregar tracking
        this.tracking = tracking;
        // obtener tramite
        this.tramite = await this.tracking.tramite().fetch();
    }

    async getTrackingOrigen() {
        let origen = await Tracking.find(this.tracking.tracking_id || '__error');
        if (!this.tracking.tracking_id) origen = this.tracking;
        if (!origen) throw new CustomException("No se encontró la dependencia de origen");
        this.tracking_origen = origen;
    }

    async getUser(id) {
        let response = await this.authentication.get(`user/${id}`)
            .then(res => res.data)
            .catch(err => ({ success: false, user: {} }));
        // validar usuario
        if (!response.success) throw new CustomException("El usuario no existe!");
        // response
        return response.user;
    }

    async getRole(dependencia_id = "", level = null, user_id = null) {
        let role = Role.query()
            .where('dependencia_id', dependencia_id)
            .where('entity_id', this.entity_id)
            .where('state', 1)
        if (level) role.where('level', level);
        if (user_id) role.where('user_id', user_id);
        // obtener
        role = await role.first();
        return role;
    }
    
    getModo() {
        return this.is_privated ? 'YO' : 'DEPENDENCIA';
    }

    async generateSelfRoles() {
        this.current_boss = await this.getRole(this.dependencia_id, 'BOSS');
        this.current_role = await this.getRole(this.dependencia_id, null, this.user_id);
    }

    async generateInfo({ onlyDescription = true }, callback = null) {
        let description = this.body.description || '';
        let files = this.request ? this.request.file('files') : null;
        if ((!onlyDescription && (files || description)) || (onlyDescription && description)) {
            let info = await Info.create({ description }, this.trx);
            // processar archivos
            if (files) {
                let apiFile = new FileEntity();
                let infoFile = {
                    object_id: info.id,
                    object_type: 'App/Models/Info',
                    extnames: ['PDF', 'pdf', 'doc', 'DOC', 'docx', 'DOCX', 'zip', 'ZIP', 'rar', 'RAR']
                }
                // guardar archivos
                await apiFile.store(this.request, infoFile, `tramite/${this.tramite.slug}/info`, this.trx);
            }
            return typeof callback == 'function' ? callback(info) : info;
        }
        // response error
        return null;
    }

    async validateStatus(status) {
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

    async disableTrackingCurrent() {
        let payload = { current: 0, visible: 0 };
        if (!this.tracking.readed_at) payload.readed_at = moment().format('YYYY-MM-DD hh:mm:ss');
        // preparate
        this.tracking.merge(payload);
        await this.tracking.save();
    }

    async disabledVisible (dependenciaIds = [], trackingIds = [], userVerifyIds = []) {
        await DB.table('trackings as t')
            .join('tramites as tra', 'tra.id', 't.tramite_id')
            .whereIn('t.user_verify_id', userVerifyIds)
            .where('tra.slug', this.tramite.slug)
            .whereIn('t.dependencia_id', dependenciaIds)
            .whereNotIn('t.id', trackingIds)
            .update({ 't.visible': 0, 't.current': 0 });
    }

    async deleteFilesNotPdf () {
        let files = await File.query()
            .where('object_type', 'App/Models/Tramite')
            .where('object_id', this.tracking.tramite_id)
            .whereIn('extname', ['docx', 'doc'])
            .fetch();
        files = await files.toJSON();
        // eliminamos archivo del storage
        for (let file of files) {
            let existsFile = await Drive.exists(file.real_path);
            if (existsFile) await Drive.delete(file.real_path);
            // eliminar regístro
            await File.query()
                .where('id', file.id)
                .delete()
        }
    }

    async rollbackTracking () {
        await Tracking.query()
            .where('id', this.tracking.id)
            .update({ current: 1, visible: 1 });
    }

    async count_file_observer() {
        let count = await File.query()
            .where('object_type', 'App/Models/Tramite')
            .where('object_id', this.tracking.tramite_id)
            .whereNotNull('observation')
            .getCount('id');
        if (count) throw new CustomException("Existe uno o varios archivos observados");
        return true;
    }

    actionStatus = () => {
        return this.is_action ? 'RECIBIDO' : 'COPIA';
    }

    async canAllowAction() {
        if (this.is_privated && (this.user_id != this.tracking.user_verify_id)) {
            throw new CustomException("Usted no puede derivar el trámite");
        } else {
            if (!Object.keys(this.current_role || {}).length) new CustomException("Usted no cuenta con un rol para derivar el trámite fuera de la dependencia");
            if (this.current_role.status != 'BOSS' && this.tracking.modo != 'DEPENDENCIA') throw new CustomException("Usted no puede derivar el trámite fuera de la dependencia");
        }
        return true;
    }

    async isModoBoss(boss, next_tracking = {}) {
        return boss.user_id == next_tracking.user_verify_id ? 'DEPENDENCIA' :  'YO';
    }


    /**
     * resolver funcion por status
     * @returns 
     */
    async resolveStatus() {
        let resolvers = {
            ANULADO: this.anulado,
            ENVIADO: this.enviado,
            RESPONDIDO: this.respondido,
            DERIVADO: this.enviado,
            ACEPTADO: this.aceptado,
            RECHAZADO: this.rechazado,
            FINALIZADO: this.finalizado,
        }
        // executar resolver
        let handle = resolvers[this.status] || null;
        if (typeof handle == 'function') return await handle();
        throw new CustomException("La acción no está permitida");
    }


    /**
     * Funccione encargada de ejecutar el tracking
     * 
     */

    async execute (id, status, body = {}) {
        this.status = status;
        this.body = body;
        // iniciar transacción
        this.trx = await DB.beginTransaction();
        // obtener tracking
        await this.getTracking(id);
        // obtener roles de la dependencia actual
        await this.generateSelfRoles();
        // executar status
        let nextTracking = await this.resolveStatus();
        // response
        return nextTracking;
    }


    /**
     * Estado anulado
     * 
     */

    anulado = async () => {
        // transacción
        let payload = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking.dependencia_id,
            person_id: this.tracking.person_id,
            user_verify_id: this.tracking.user_verify_id,
            user_id: this.user_id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            modo: this.tracking.modo,
            status: 'ANULADO',
            readed_at: null
        };
        // crear anulado
        let anulado = await Tracking.create(payload);
        // deshabilitar tracking
        await this.disableTrackingCurrent();
        // deshabilitar tramite
        await Tramite.query()
            .where('id', this.tracking.tramite_id)
            .update({ state: 0 });
        // response
        return anulado
    }


    /**
     *  Estado derivado o Enviado
     * 
     */

    enviado = async () => {
        // validar datos
        await validation(null, this.body, { dependencia_destino_id: 'required' });
        this.is_privated = this.body.dependencia_destino_id == this.tracking.dependencia_id;
        if (this.is_privated) {
            await validation(null, this.body, { user_destino_id: 'required' });
            // validar si el usuario destino es el mismo
            if (this.user_id == this.body.user_destino_id) throw new ValidatorError([{ field: 'user_destino_id', message: 'Usted no puede ser el usuario destino' }]);
        }
        // validar archivos observados
        await this.count_file_observer();
        // generar recibido
        let payload_recibido = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.body.dependencia_destino_id,
            person_id: null,
            user_verify_id: null,
            user_id: this.user_id || null,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            is_action: this.is_action,
            status: this.actionStatus(),
            readed_at: null
        }
        // obtener jefe de la oficina destino
        this.destino_boss = await this.getRole(payload_recibido.dependencia_id, 'BOSS');
        // verificar que el tramite va a otra oficina
        if (!this.is_privated) {
            if (this.is_externo) {
                this.current_user = this.destino_boss;
                this.current_user.id = this.destino_boss.user_id;
            } else {
                this.current_user = await this.getUser(this.destino_boss.user_id);
            }
            // add
            payload_recibido.user_verify_id = this.current_user.id;
            payload_recibido.modo = 'DEPENDENCIA';
            payload_recibido.person_id = this.current_user.person_id;
        } else {
            this.current_user = await this.getUser(this.body.user_destino_id);
            payload_recibido.user_verify_id = this.current_user.id;
            payload_recibido.person_id = this.current_user.person_id;
            payload_recibido.modo = await this.isModoBoss(this.destino_boss, payload_recibido);
        }
        // crear derivado o enviado según sea el caso
        let payload_derivado = Object.assign({}, payload_recibido);
        payload_derivado.dependencia_id = this.tracking.dependencia_id;
        payload_derivado.user_verify_id = this.tracking.user_verify_id;
        payload_derivado.person_id = this.tracking.person_id;
        payload_derivado.current = 0;
        payload_derivado.status = this.status;
        payload_derivado.is_action = 1;
        payload_derivado.modo = await this.isModoBoss(this.current_boss, payload_derivado);
        // procesar trámite
        try {
            // obtener info
            await this.generateInfo({ onlyDescription: false }, (info) => {
                payload_derivado.info_id = info.id;
                payload_recibido.info_id = info.id;
            });
            // crear recibido
            let recibido = await Tracking.create(payload_recibido, this.trx);
            // agregar tracking_id al derivado
            payload_derivado.tracking_id = recibido.id;
            // crear derivado
            let derivado = await Tracking.create(payload_derivado, this.trx);
            // multiples
            if (!this.is_privated) await this.multipleDependencias(recibido, derivado);
            else await this.multipleUsers(recibido, derivado);
            // guardar cambios
            await this.trx.commit();
            // disabled visible
            await this.disabledVisible(
                [derivado.dependencia_id, recibido.dependencia_id], 
                [recibido.id, derivado.id],
                [recibido.user_verify_id, derivado.user_verify_id]
            );
            // eliminar archivos
            await this.deleteFilesNotPdf();
            // next tracking
            return derivado;
        } catch (error) {
            await this.rollbackTracking();
            await this.trx.rollback();
            throw new CustomException("No se pudó procesar la acción");
        }
    }


    /**
     *  Estado respondido
     * @returns 
     */
    respondido = async () => {
        // obtener origen
        await this.getTrackingOrigen();
        // generar recibido
        let payload_recibido = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking_origen.dependencia_id,
            person_id: this.tracking_origen.person_id,
            user_verify_id: this.tracking_origen.user_verify_id,
            user_id: this.user_id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            status: 'RECIBIDO',
            readed_at: null
        }
        // obtener jefe del area del documento
        this.destino_boss = await this.getRole(payload_recibido.dependencia_id, 'BOSS');
        payload_recibido.modo = await this.isModoBoss(this.destino_boss, payload_recibido);
        // generar respondido 
        let payload_respondido = Object.assign({}, payload_recibido);
        // processar datos
        try {
            // obtener info
            await this.generateInfo({ onlyDescription: false }, (info) => {
                payload_recibido.info_id = info.id;
                payload_respondido.info_id = info.id;
            });
            // setting payload respondido
            payload_respondido.tramite_id = this.tracking.tramite_id;
            payload_respondido.dependencia_id = this.tracking.dependencia_id;
            payload_respondido.person_id = this.tracking.person_id;
            payload_respondido.user_verify_id = this.tracking.user_verify_id;
            payload_respondido.current = 0;
            payload_respondido.status = 'RESPONDIDO';
            payload_respondido.modo = await this.isModoBoss(this.current_boss, payload_respondido);
            // crear recibido
            let recibido = await Tracking.create(payload_recibido, this.trx);
            // obtener tracking id
            payload_respondido.tracking_id = recibido.id;
            // crear respondido
            let respondido = await Tracking.create(payload_respondido, this.trx);
            // guardar cambios
            await this.trx.commit();
            // disabled visible
            await this.disabledVisible(
                [respondido.dependencia_id, recibido.dependencia_id], 
                [respondido.id, recibido.id],
                [respondido.user_verify_id, recibido.user_verify_id]
            );
            // response
            return respondido;
        } catch (error) {
            // cancelar cambios
            await this.disabledVisible();
            await this.trx.rollback();
            throw new CustomException(error.message);
        }
    }


    /**
     * Estado aceptado
     * 
     */
    
    aceptado = async () => {
        // obtener tracking origen
        await this.getTrackingOrigen();
        // generar aceptado
        let payload_aceptado = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking_origen.dependencia_id,
            person_id: this.tracking_origen.person_id,
            user_verify_id: this.tracking_origen.user_verify_id,
            user_id: this.user_id || null,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            info_id: this.tracking.info_id,
            current: 0,
            first: 0,
            status: 'ACEPTADO',
            readed_at: this.tracking_origen.first ? moment().format('YYYY-MM-DD hh:mm:ss') : null,
        };
        // obtener jefe del area del documento
        this.destino_boss = await this.getRole(payload_aceptado.dependencia_id, 'BOSS');
        payload_aceptado.modo = this.tracking_origen.dependencia_id ? await this.isModoBoss(this.destino_boss, payload_aceptado) : 'DEPENDENCIA';
        // generar payload pendiente
        let payload_pendiente = Object.assign({}, payload_aceptado);
        // procesar datos
        try {
            // obtener info
            await this.generateInfo({ onlyDescription: true }, (info) => {
                payload_aceptado.info_id = info.id;
                payload_pendiente.info_id = info.id;
            });
            // crear aceptado
            let aceptado = await Tracking.create(payload_aceptado, this.trx);
            // obtener usuario actual
            this.current_user = await this.getUser(this.tracking.user_verify_id);
            // genearar pendiente
            payload_pendiente.dependencia_id = this.tracking.dependencia_id;
            payload_pendiente.person_id = this.current_user.person_id;
            payload_pendiente.user_verify_id = this.current_user.id;
            payload_pendiente.tracking_id = aceptado.id;
            payload_pendiente.revisado = this.tracking.is_action ? 0 : 1;
            payload_pendiente.current = 1;
            payload_pendiente.visible = 1;
            payload_pendiente.readed_at = null;
            payload_pendiente.status = 'PENDIENTE';
            payload_pendiente.modo = await this.isModoBoss(this.current_boss, payload_pendiente);
            // crear pendiente
            let pendiente = await Tracking.create(payload_pendiente, this.trx);
            // guardar cambios
            this.trx.commit();
            // disabled visible
            await this.disabledVisible(
                [pendiente.dependencia_id, aceptado.dependencia_id], 
                [pendiente.id, aceptado.id],
                [pendiente.user_verify_id, aceptado.user_verify_id]
            );
            // response
            return pendiente;
        } catch (error) {
            // cancelar cambios
            await this.disabledVisible();
            this.trx.rollback();
            throw new CustomException("No se pudó procesar la acción");
        }
    }


    /**
     * Estado rechazado
     * 
     */

    rechazado = async () => {
        // obtener origen
        await this.getTrackingOrigen();
        // generar pendiente
        let payload_pendiente = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking_origen.dependencia_id,
            person_id: this.tracking_origen.person_id,
            user_verify_id: this.tracking_origen.user_verify_id,
            user_id: this.user_id,
            tracking_id: this.tracking.id,
            revisado: 0,
            visible: 1,
            current: 1,
            info_id: this.tracking.info_id,
            first: 0,
            alert: 1,
            next: this.tracking_origen.next,
            status: 'PENDIENTE',
            readed_at: null,
        };
        // obtener jefe del area del documento
        this.destino_boss = await this.getRole(payload_pendiente.dependencia_id, 'BOSS');
        payload_pendiente.modo = this.tracking_origen.dependencia_id ? await this.isModoBoss(this.destino_boss, payload_pendiente) : 'DEPENDENCIA';
        // generar payload rechazado
        let payload_rechazado = Object.assign({}, payload_pendiente);
        // procesar tracking
        try {
            // obtener info
            await this.generateInfo({ onlyDescription: true }, (info) => {
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
            payload_rechazado.modo = await this.isModoBoss(this.current_boss, payload_rechazado);
            // crear rechazado
            let rechazado = await Tracking.create(payload_rechazado, this.trx);
            // guardar cambios
            this.trx.commit();
            // disabled visible
            await this.disabledVisible(
                [rechazado.dependencia_id, pendiente.dependencia_id], 
                [rechazado.id, pendiente.id],
                [rechazado.user_verify_id, pendiente.user_verify_id]
            );
            // response
            return rechazado;
        } catch (error) {
            // cancelar cambios
            await this.disabledVisible();
            await this.trx.rollback();
            throw new CustomException(error.message);
        }
    }


    /**
     *  Estado finalizado
     * 
     */

    finalizado = async () => {
        // generar finalizado
        let payload = {
            tramite_id: this.tracking.tramite_id,
            dependencia_id: this.tracking.dependencia_id,
            person_id: this.tracking.person_id,
            user_verify_id: this.tracking.user_verify_id,
            user_id: this.user_id,
            tracking_id: this.tracking.id,
            revisado: 1,
            visible: 1,
            current: 1,
            first: 0,
            modo: this.tracking.modo,
            status: 'FINALIZADO',
            readed_at: null
        }
        // procesar tracking
        try {
            // obtener info
            await this.generateInfo({ onlyDescription: false }, (info) => {
                payload.info_id = info.id;
            });
            // crear finalizado
            let finalizado = await Tracking.create(payload, this.trx);
            // cambiar estado
            await Tramite.query()
                .where('id', finalizado.tramite_id)
                .update({ state : 0 });
            // guardar cambios
            await this.trx.commit();
            // disabled visible
            await this.disabledVisible(
                [finalizado.dependencia_id], 
                [finalizado.id], 
                [finalizado.user_verify_id]
            );
            // response
            return finalizado;
        } catch (error) {
            // cancelar cambios
            await this.disabledVisible();
            await this.trx.rollback();
            await Tramite.query().where('id', this.tracking.tramite_id).update({ state : 1 });
            throw new CustomException(error.message);
        }
    }


    /**
     * Multiple dependencias
     * 
     */

    multipleDependencias = async (next_tracking, current_tracking) => {
        // validar permitidos
        let allow = ['DERIVADO', 'ENVIADO'];
        if (!this.multiple.length) return false;
        if (!allow.includes(this.status)) return false;
        this.multiple = collect(this.multiple || []);
        let ids = this.multiple.pluck('id').toArray();
        let roles = Role.query()
            .where('entity_id', this.entity.id);
        // filtrar dependencia
        if (next_tracking.dependencia_id) roles.whereNotIn('dependencia_id', [next_tracking.dependencia_id])
        // obtener datos
        roles = await roles.whereIn('dependencia_id', ids)
            .where('level', 'BOSS')
            .where('state', 1)
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
                    user_id: this.user_id,
                    tracking_id: next_tracking.tracking_id,
                    multiple_id: current_tracking.id,
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
    }


    /**
     * Multiples usuarios
     * 
     */

    multipleUsers = async (next_tracking, current_tracking) => {
        // validar permitidos
        let allow = ['DERIVADO', 'ENVIADO'];
        if (!this.users.length) return false;
        if (!allow.includes(this.status)) return false;
        // datos reales
        let payload = collect([]);
        // filtrar
        await this.users.map(async u => {
            payload.push({
                tramite_id: this.tracking.tramite_id,
                dependencia_id: current_tracking.dependencia_id,
                person_id: u.person_id,
                user_verify_id: u.id,
                user_id: this.user_id,
                tracking_id: next_tracking.tracking_id,
                multiple_id: current_tracking.id,
                current: 1,
                visible: 1,
                revisado: 1,
                first: 0,
                modo: this.current_boss.user_id == u.id ? 'DEPENDENCIA' : 'YO',
                is_action: u.is_action ? 1 : 0,
                status: u.is_action ? 'RECIBIDO' : 'COPIA'
            });
        });
        // generar copia
        await Tracking.createMany(payload.toArray(), this.trx);
    }

}

module.exports = NextEntity;