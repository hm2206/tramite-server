'use strict'

const Tramite = exports = module.exports = {}
const Tracking = use('App/Models/Tracking');
const Role = use('App/Models/Role');
const NotFoundModelException = require('../Exceptions/NotFoundModelException')

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
    // crear tracking
    await Tracking.create({
        tramite_id: tramite.id,
        dependencia_id: dependencia.id,
        dependencia_origen_id: dependencia.id,
        dependencia_destino_id: dependencia.id,
        person_id: tramite.person_id,
        user_id: auth.id,
        user_verify_id,
        current: 1,
        alert: 0,
        revisado: 0,
        status: 'REGISTRADO',
        modo: self_remitente ? 'YO' : 'DEPENDENCIA',
        first: 1
    });
}