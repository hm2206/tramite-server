'use strict'

const Tramite = exports = module.exports = {}
const Tracking = use('App/Models/Tracking');
const Role = use('App/Models/Role');
const NotFoundModelException = require('../Exceptions/NotFoundModelException')
const CustomException = require('../Exceptions/CustomException');

Tramite.createTramite = async (request, tramite, person, creado, dependencia) => {
    // enviar correo
    request.api_authentication.post('mail/to', {
        from: request.$system.email,
        email: person.email_contact,
        header: `Trámite ${tramite.dependencia_origen_id ? 'regístrado' : 'enviado'} correctamente`,
        username: `Código: ${tramite.slug}`,
        contenido: `
            Dependencia destino: <b>${dependencia.nombre}</b> <br/>
            Creado por: <b style="text-transform: capitalize;">${creado.fullname}</b>
        `,
        subject: 'Nuevo trámite'
    });
}

Tramite.tracking = async (request, tramite, is_externo = false) => {
    let auth = request.$auth;
    let dependencia = request.$dependencia;
    let self_remitente = 0;
    let user_verify_id = !is_externo ? auth.id : null;
    let next = request.input('next', "");
    let allow = ['RESPONDIDO'];
    let tracking_id = null;
    // validar remitente
    if (!is_externo) {
        self_remitente = tramite.person_id == auth.person_id ? 1 : 0;
    }
    // validar allow
    if (next && !allow.includes(next)) throw new CustomException(`la siguiente acción "${next}" no está permitida!`);
    // validar acción
    if (!self_remitente) {
        let role = await Role.query()
            .where('entity_id', tramite.entity_id)
            .where('dependencia_id', tramite.dependencia_origen_id)
            .where('level', 'BOSS')
            .first();
        if (!role) throw new NotFoundModelException("al jefe");
        user_verify_id = role.user_id;
    }
    // obtener tracking id
    if (tramite.tramite_parent_id && next) {
        let before_tracking = await Tracking.query()
            .with('tramite')
            .where("tramite_id", tramite.tramite_parent_id)
            .where("current", 1)
            .first();
        if (!before_tracking) throw new CustomException(`No se encontró un seguimiento activo del trámite raíz!`);
        tracking_id = before_tracking.tracking_id || before_tracking.id;
        // finalizar
        let allow = ['RESPONDIDO'];
        if (allow.includes(next)) {
            before_tracking.merge({
                current: 0,
                status: 'FINALIZADO'
            });
            // guardar los cambios
            await before_tracking.save();
        }
    }
    // crear tracking
    let tracking = await Tracking.create({
        tramite_id: tramite.id,
        dependencia_id: dependencia ? dependencia.id : tramite.dependencia_origen_id,
        person_id: tramite.person_id,
        user_id: !is_externo ? auth.id : null,
        user_verify_id,
        current: 1,
        alert: 0,
        revisado: 0,
        status: is_externo ? 'ENVIADO' : 'REGISTRADO',
        modo: self_remitente ? 'YO' : 'DEPENDENCIA',
        first: 1,
        tracking_id,
        next: tramite.tramite_parent_id ? next : '',
        readed_at: null
    });
    // enviar socket cuando es interno
    if (!is_externo) {
        let socket = request.$io();
        socket.emit('Tramite/TramiteListener.store', { tramite, tracking });
        // enviar notification
        request.api_authentication.post(`auth/notification`, {
            receive_id: tracking.user_verify_id,
            title: `Nuevo trámite: ${tramite.slug}`,
            description: `Se acabá de agregar un trámite a tu bandeja de entrada`,
            method: request.$method,
        }).catch(err => console.log(err));
    } else {
        tramite.merge({ dependencia_origen_id: null });
        await tramite.save();
    };
}