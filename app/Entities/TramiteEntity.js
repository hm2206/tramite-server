'use strict';

const DB = use('Database');
const Drive = use('Drive');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const TramiteType = use('App/Models/TramiteType');
const Role = use('App/Models/Role');
const NotFoundModelException = require('../Exceptions/NotFoundModelException');
const CustomException = require('../Exceptions/CustomException');
const { validation, ValidatorError } = require('validator-error-adonis');
const DBException = require('../Exceptions/DBException');
const FileEntity = require('../Entities/FileEntity');
const { collect } = require('collect.js');
const { PDFDocument } = require('pdf-lib');
const moment = require('moment');
const NextEntity = require('./NextEntity');

class TramiteEntity {

    constructor (authentication = {}) {
        if (authentication) this.authentication = authentication;
    }
    
    attributes = {
        entity_id: "",
        person_id: "",
        slug: "",
        document_number: "",
        tramite_type_id: "",
        folio_count: 0,
        asunto: "",
        observation: "",
        dependencia_origen_id: "",
        tramite_parent_id: "",
        user_id: "",
        state: 1
    }

    dataPagination = {
        page: 1,
        perPage: 20,
        query_search: "",
        custom: {}
    }

    async index(tmpDatos = this.dataPagination) {
        let datos = Object.assign(this.dataPagination, tmpDatos);
        let tramites = Tramite.query()
            .with('current_tracking', (build) => {
                build.where('current', 1)
                    .where('visible', 1)
            })
            .withCount('current_tracking')
            .with('tramite_type')
        // filtrar query_saerch
        if (datos.query_search) tramites.where(DB.raw(`(slug like '%${datos.query_search}%' OR asunto like '%${datos.query_search}%')`));
        // filtros
        for (let attr in datos.custom) {    
            let value = datos.custom[attr];
            if (Array.isArray(value)) tramites.whereIn(attr, value);
            else if (typeof value != 'undefined' && value != '' && value != null) tramites.where(DB.raw(attr), value);
        } 
        let isPaginate = datos.perPage ? true : false;
        // obtener datos
        tramites = isPaginate ? await tramites.paginate(datos.page, datos.perPage) :  await tramites.fetch();
        tramites = await tramites.toJSON();
        let result = collect(isPaginate ? tramites.data : tramites);
        let dependenciaIds = result.groupBy('dependencia_origen_id').keys().toArray();
        let peopleIds = result.groupBy('person_id').keys().toArray();
        // obtener dependencias
        let dependencias = await this.authentication.get(`dependencia?ids[]=${dependenciaIds.join('&ids[]=')}`)
        .then(({ data }) => data.dependencia.data || [])
        .catch(err => ([]));
        dependencias = collect(dependencias);
        // obtener people
        let people = await this.authentication.get(`person?ids[]=${peopleIds.join('&ids[]=')}`)
        .then(({ data }) => data.people.data || [])
        .catch(() => ([]))
        people = collect(people);
        // setting tramite
        result = await result.toArray();
        await result.map(tra => {
            tra.person = people.where('id', tra.person_id).first() || {};
            tra.dependencia = dependencias.where('id', tra.dependencia_origen_id).first() || {};
            return tra
        });
        // add tramites
        if (isPaginate) tramites.data = result;
        else tramites = result;
        // result
        return tramites;
    }

    async show(id, column = 'id') {
        let allowColumn = ['id', 'slug'];
        if (!allowColumn.includes(column)) throw new CustomException("La columna no está permitida!");
        let tramite = await Tramite.findBy(column, id);
        if (!tramite) throw new NotFoundModelException("El trámite");
        tramite.code_qr = await tramite.funcCodeQr();
        tramite.tramite_type = await tramite.tramite_type().fetch();
        tramite.files = await tramite.files().where('object_type', 'App/Models/Tramite').fetch();
        tramite = JSON.parse(JSON.stringify(tramite));
        // obener persona
        let { person } = await this.authentication.get(`person/${tramite.person_id}`)
        .then(res => res.data)
        .catch(() => ({ person: {} }));
        // obtener dependencia
        let { dependencia } = await this.authentication.get(`dependencia/${tramite.dependencia_origen_id}`)
        .then(res => res.data)
        .catch(() => ({ dependencia: {} }))
        // add datos
        tramite.person = person;
        tramite.dependencia = dependencia;
        return tramite;
    }

    async store (request, datos = this.attributes, auth = {}, next = null) {
        // validaciones
        await validation(null, datos, {
            slug: "required|max:10|min:10",
            entity_id: "required",
            dependencia_id: "required",
            person_id: "required",
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            asunto: 'required|min:4'
        });
        // validar dependencias
        const isAuth = Object.keys(auth || {}).length;
        const self_remitente = isAuth ? auth.person_id == datos.person_id : false;
        // generar slug
        let slug = `${datos.slug}`.toUpperCase();
        // validar slug
        const existSlug = await Tramite.findBy('slug', slug);
        if (existSlug) throw new Error("El código autogenerado ya existe!!!");
        // obtener persona
        let { person, success } = await this.authentication.get(`person/${datos.person_id || '_error'}`)
        .then(res => res.data)
        .catch(err => ({ success: false }));
        if (!success) throw new ValidatorError([{ field: 'person_id', message: `La persona no existe!` }]);
        // obtener tramite documento
        let type = await TramiteType.find(datos.tramite_type_id);
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de documento es incorrecto' }]);
        // preparar datos
        let payload = {
            entity_id: datos.entity_id,
            person_id: person.id,
            slug: slug,
            document_number: datos.document_number,
            tramite_type_id: datos.tramite_type_id,
            folio_count: 0,
            observation: datos.observation,
            asunto: datos.asunto,
            dependencia_origen_id: isAuth ? datos.dependencia_id : null,
            tramite_parent_id: null,
            user_id: isAuth ? auth.id : null,
        } 
        // verificar role
        let boss = await Role.query()
            .where('entity_id', datos.entity_id)
            .where('dependencia_id', datos.dependencia_id)
            .where('level', 'BOSS')
            .where('state', 1)
            .first();
        if (!boss) throw new NotFoundModelException("Al jefe");
        // validar tramite parent
        if (datos.tramite_id) {
            let tramite_parent = await Tramite.find(request.input('tramite_id'));
            if (!tramite_parent) throw new NotFoundModelException("El trámite raíz");
            payload.tramite_parent_id = tramite_parent.id;
            payload.slug = tramite_parent.slug;
        }
        // transacciones
        let trx = await DB.beginTransaction();
        // procesar trámite
        try {
            // guardar tramite
            let tramite = await Tramite.create(payload, trx);
            // preparar tracking
            let payload_tracking = {
                tramite_id: tramite.id,
                dependencia_id: isAuth ? datos.dependencia_id : null,
                person_id: tramite.person_id,
                user_id: isAuth ? auth.id : null,
                user_verify_id: isAuth ? auth.id : null,
                current: 1,
                alert: 0,
                revisado: isAuth ? 0 : 1,
                status: 'REGISTRADO',
                modo: self_remitente ? 'YO' : 'DEPENDENCIA',
                first: 1,
                tracking_id: null,
                next: tramite.tramite_parent_id ? next : null,
                readed_at: isAuth ? null : moment().format('YYYY-MM-DD HH:mm:ss')
            };
            // validar next tracking
            let allow = ['RESPONDIDO'];
            if (next && !allow.includes(next))  throw new CustomException(`la siguiente acción "${next}" no está permitida!`);
            // obtener boss
            if (!self_remitente) {
                // actualizar user_verify_id
                payload_tracking.user_verify_id = boss.user_id;
            }
            // obtener tracking
            if (tramite.tramite_parent_id) {
                let before_tracking = await Tracking.query()
                    .where("tramite_id", tramite.tramite_parent_id)
                    .where("current", 1)
                    .first(); 
                if (!before_tracking) throw new CustomException(`No se encontró un seguimiento activo del trámite raíz!`);
                payload_tracking.tracking_id = before_tracking.id;
                // acabar recorrido del trámite
                payload_tracking.tracking_id = before_tracking.tracking_id;
                before_tracking.merge({ 
                    current: 0, 
                    status: 'PENDIENTE',
                    visible: 0
                });
                await before_tracking.save();
                // validar nuevo tracking
                payload_tracking.status = 'SUBTRAMITE';
            }
            // crear tracking
            let tracking = await Tracking.create(payload_tracking, trx);
            // guardar archivos
            const fileEntity = new FileEntity();
            let files = await fileEntity.store(request, { 
                object_id: tramite.id, 
                object_type: 'App/Models/Tramite',
                extnames: ['pdf', 'docx', 'doc', 'zip', 'rar', 'DOCX', 'DOC', 'PDF', 'ZIP', 'RAR']
            }, `/tramite/${slug}`, trx);
            // guardar transacción
            await trx.commit();
            // obtener folio
            let folio_count = await this.generateFolio(tramite, files);
            if (folio_count) {
                tramite.merge({ folio_count: folio_count });
                await tramite.save();
            }
            // add 
            tramite.tracking = tracking;
            tramite.person = person;
            tramite.files = files;
            // validar si el trámite viene desde afuera
            if (!tramite.dependencia_origen_id) {
                let authentication = request.api_authentication;
                const nextEntity = new NextEntity(authentication, datos.entity_id, datos.dependencia_id)
                nextEntity.setIsAction(1);
                nextEntity.setIsExterno(true);
                await nextEntity.execute(tracking.id, 'ENVIADO', { dependencia_destino_id: datos.dependencia_id })
            }
            // response
            return JSON.parse(JSON.stringify(tramite));
        } catch (error) {
            await trx.rollback();
            throw new DBException(error, "regístro");
        }
    }

    async update (id, datos = this.attributes, user_id = 0) {
        await validation(null, datos, {
            asunto: 'required|max:255',
            tramite_type_id: 'required',
            folio_count: 'required|number',
            observation: 'max:1000'
        });
        // obtener trámite
        let tramite = await Tramite.query() 
            .join('trackings as tra', 'tra.tramite_id', 'tramites.id')
            .where('tramites.id', id)
            .where('tramites.state', 1)
            .select('tramites.*', 'tra.status', 'tra.user_id', 'tra.user_verify_id')
            .first();
        if (!tramite) throw new NotFoundModelException("El trámite");
        // validar actualización
        if (user_id) {
            if (tramite.user_id != user_id && tramite.user_verify_id != user_id) throw new CustomException("Usted no está permitido a guardar los cambios del trámite");
        }
        // preparar datos
        tramite.merge({ 
            asunto: datos.asunto,
            tramite_type_id: datos.tramite_type_id,
            folio_count: datos.folio_count,
            observation: datos.observation
        })
        // guardar
        await  tramite.save();
        return tramite;
    }

    async delete (id) {
        let tramite = await Tramite.find(id);
        if (!tramite) throw new NotFoundModelException("El trámite")
        let isDelete = await tramite.delete();
        return isDelete;
    }

    async generateFolio (tramite, files = []) {
        let folio_count = 0;
        let only_pdf = collect(files).where('extname', 'pdf').toArray();
        for (let file of only_pdf) {
            try {
                let exists = await Drive.exists(file.real_path);
                if (!exists) continue;
                let current_pdf = await Drive.get(file.real_path);
                let docPdf = await PDFDocument.load(current_pdf);  
                folio_count += docPdf.getPageCount(); 
            } catch (error) { }
        }
        // response
        return folio_count;
    }

}

module.exports = TramiteEntity;