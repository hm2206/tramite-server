'use strict'

const { PDFAssembler } = require('pdfassembler');
const Drive = use('Drive');
const Helpers = use('Helpers');
const { PDFDocument, drawRectangle, rgb, degrees, drawImage } = require('pdf-lib');
const signapdf = require('node-signpdf');
const axios = require('axios').default;
const soap = require('soap');
const fs = require('fs');


class SignerController {

  handle = async ({ request }) => {
    let url = 'http://192.168.100.7:9864/WsFirmaDigital.svc?singleWsdl';

    let pdf = fs.readFileSync(Helpers.tmpPath('boleta.pdf'), 'base64');

    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

    let payload = {
      Dni: "44156036",
      ClavePfx: "joserogelio", 
      FileName: "testing_firma.pdf",
      ArchivoBase: pdf, 
      Reason: "Soy el autor del documento", 
      Location: "Peruano", 
      AddVisibleSign: true,
      PageSignature: 1,
      PathImg: "https://unujobs.com/api_authentication/find_file_local?path=person/img/person_44156036.jpg&update=1600980459497&size=200x200",
      PositionX: 10,
      PositionY: 10,
      Width: 150,
      Height: 50
    }

    // 7 x 5.94 cm
    
    let api = await soap.createClientAsync(url)
      .then(async client => {
        return await client.SignHashedAsync(payload)
      }).then(result => {
        let [{SignHashedResult}] = result;
        let [link, direction] = `${SignHashedResult}`.split(';');
        let parsePath = `${direction}`.split('\\\\').pop();
        let fileName = `${link}/${parsePath}`.replace('\\', '/');
        return { 
          err: null,
          link: fileName
        }
      }).catch(err => ({
        err
      }));

    // await soap.createClientAsync(url)
    //   .then(async client => {
    //     return await client.CreateFileAsync({ Name: 'fiufiu.pdf', ArchivoBase: pdf })
    //   }).then(result => {
    //     console.log(result);
    //   }).catch(err => {
    //     console.log(err.message);
    //     throw new Error("No se pudo firmar el archivo");
    //   });

    // fs.writeFileSync(Helpers.tmpPath('pdf.text'), Buffer.from(pdf))

    // (url, (err, client) => {
    //   client.CreateFile(testing, (err, result) => {
    //     if (err) throw new Error ('Algo salio mal');
    //     let { CreateFileResult } = result;
    //     if (CreateFileResult) {
    //       client.SignHashed(payload, (err, result) => {
    //         console.log(result);
    //       }) 
    //     } else throw new Error('no se puede firmar');
    //   }
    return api;

    return {
      success: true,
      status: 201,
      message: "Firma correcta"
    };
  }

}

module.exports = SignerController
