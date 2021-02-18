'use strict'

const Tramite = exports = module.exports = {}
const Tracking = use('App/Models/Tracking');
const Role = use('App/Models/Role');
const NotFoundModelException = require('../Exceptions/NotFoundModelException')
const CustomException = require('../Exceptions/CustomException');

Tramite.createTramite = async (request, tramite, person, creado, dependencia) => {
    await request.api_authentication.post('mail/to', {
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


Tramite.tracking = async (request, tramite) => {
    let auth = request.$auth;
    let dependencia = request.$dependencia;
    let self_remitente = tramite.person_id == auth.person_id ? 1 : 0;
    let user_verify_id = auth.id;
    let next = request.input('next', "");
    let allow = ['RESPONDIDO'];
    let tracking_id = null;
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
        // finalizar trámite anterior
        before_tracking.merge({ 
            current: 0, 
            visible: 0
        });
        // obtener tramite
        let before_tramite = await before_tracking.tramite().fetch();
        console.log(before_tramite);
        before_tramite.merge({ state: 0 });
        await before_tramite.save();
        // actualizar
        await before_tracking.save();
    }
    // crear tracking
    await Tracking.create({
        tramite_id: tramite.id,
        dependencia_id: dependencia.id,
        person_id: tramite.person_id,
        user_id: auth.id,
        user_verify_id,
        current: 1,
        alert: 0,
        revisado: 0,
        status: 'REGISTRADO',
        modo: self_remitente ? 'YO' : 'DEPENDENCIA',
        first: 1,
        tracking_id,
        next: tramite.tramite_parent_id ? next : ''
    });
    // validar next
    if (next) {
        // deshabilitar tramite
        await Tramite.query()
            .where('id', tramite.tramite_parent_id)
            .update({ state : 1 });
    }
}