'use strict'

const { PDFAssembler } = require('pdfassembler');
const Drive = use('Drive');
const Helpers = use('Helpers');
const { PDFDocument, drawRectangle, rgb, degrees, drawImage } = require('pdf-lib');
const signapdf = require('node-signpdf');




class SignerController {

    handle = async ({ request }) => {
        
      const signaturePdf = await Drive.get(Helpers.tmpPath('example.pdf'));

      const createPdf = async (params) => {
        const requestParams = {
            placeholder: {},
            text: 'node-signpdf',
            addSignaturePlaceholder: true,
            pages: 1,
            ...params,
        };
    
        const pdf = await PDFDocument.create({
          autoFirstPage: false,
          size: 'A4',
          layout: 'portrait'
        });
    
        if (requestParams.pages < 1) {
            requestParams.pages = 1;
        }
    
        // Add some content to the page(s)
        for (let i = 0; i < requestParams.pages; i++) {
              let page = await pdf.addPage();
        }
    
        // Collect the ouput PDF
        // and, when done, resolve with it stored in a Buffer
      return await pdf.save();
    }

    let pdfBuffer = await createPdf();

    await Drive.put(Helpers.tmpPath('/areli.pdf'), Buffer.from(pdfBuffer));

    return 'ok';
  }

}

module.exports = SignerController
