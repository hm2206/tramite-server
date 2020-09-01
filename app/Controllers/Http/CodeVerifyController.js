'use strict'

const CodeVerify = use('App/Models/CodeVerify');
const { validation } = require('validator-error-adonis');
const { validate } = use('Validator');
const uid = require('uid');
const Encryption = use('Encryption')

class CodeVerifyController {

    store = async ({ request }) => {
        // validar request
        await validation(validate, request.all(), {
            person_id: "required"
        });
        // validar person
        let person = await request.api_authentication.get(`find_person/${request.input('person_id')}`)
            .then(res => res.data)
            .catch(err => ({}));
        if (!person.id) throw new Error("No se encontró a la persona en el sistema");
        // validar correo
        if (!person.email_contact) throw new Error("Usted no cuenta con un correo de contacto");
        // generar code
        let code = `${await uid(8)}`.toUpperCase();
        // deshabilitar códigos anteriores
        await CodeVerify.query()
            .where('person_id', request.input('person_id'))
            .update({ is_revoked : 1 });
        // generar token
        await CodeVerify.create({
            person_id: request.input('person_id'),
            code: await Encryption.encrypt(code)
        });
        // enviar email
        let send_mail = await request.api_authentication.post('mail/to', {
            from: request._system.email,
            email: person.email_contact,
            header: "Código de verificación",
            username: `Código: ${code}`,
            contenido: `Para generar un nuevo trámite, es necesario ingresar el código de verificación`,
            subject: 'Código de Verificación'
        }).then(res => res.data)
        .catch(err => ({  success: false, message: err.message}));
        // validar envio
        if (!send_mail.success) throw new Error("No se pudó enviar el código de verificación a su correo");
        // response 
        return {
            success: true,
            status: 201,
            code: 'RES_GENERATE_CODE',
            message: `El código de verificación se envió al correo: "${person.email_contact}" correctamente`
        }
    }

}

module.exports = CodeVerifyController
