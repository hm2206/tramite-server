'use strict'

const Tramite = exports = module.exports = {}

Tramite.createTramite = async (request, tramite, person, creado, dependencia) => {
    await request.api_authentication.post('mail/to', {
        from: request._system.email,
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


Tramite.verify = async (request, tramite) => {
    let auth = request.$auth;
    // enviar email
    await request.api_authentication.post('mail/to', {
        from: request._system.email,
        email: auth.email,
        header: `Trámite Verificado`,
        username: `Código: ${tramite.slug}`,
        contenido: `
            Usted acaba de dar la autorización del trámite <br/>
            <b>Mensaje:</b> ${tramite.verify_observation}
        `,
        subject: 'Trámite listo para ser derivado'
    });
}