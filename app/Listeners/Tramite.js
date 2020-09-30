'use strict'

const Tramite = exports = module.exports = {}

Tramite.createTramite = async (request, tramite, person, creado, dependencia) => {
    let response = await request.api_authentication.post('mail/to', {
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
