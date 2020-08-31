'use strict'

const Helpers = use('Helpers');
const Drive = use('Drive');

class FileController {

    handle = async ({ request, response }) => {
        try {
            let disk = request.input('disk', 'tmp');
            let path = request.input('path', null);
            // obtener filename
            let filename = Helpers[`${disk}Path`](path);
            // validar filename
            if (!await Drive.exists(filename)) throw new Error('No se encontró el archivo');
            // response file 
            return response.download(filename);
        } catch (error) {
            return error.message;
        }
    }

}

module.exports = FileController
